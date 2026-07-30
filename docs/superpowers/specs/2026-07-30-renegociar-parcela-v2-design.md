# Design: "Renegociar parcela" v2 — cria parcela nova (substitui o modelo anterior)

## Por que isso existe

O modelo implementado em `2026-07-30-renegociar-parcela-design.md` (já em
produção) só movia a `data_vencimento` da própria parcela pro final da fila.
O usuário testou em produção e esse **não é o comportamento certo**: o real é
que a parcela original deve permanecer visível na data original, travada, e
uma parcela **nova** deve ser criada pra representar o pagamento de fato.
Este documento substitui a mecânica de `renegociar_parcela` /
`desfazer_renegociacao` do design anterior. As decisões de UI já tomadas lá
que não mudam (onde o botão aparece, quando aparece, reaproveitar cores
existentes) continuam valendo.

## Comportamento

Ao clicar **"Renegociar"** numa parcela (só aparece se `!paga && !renegociada`,
e se a parcela for do tipo `entrada`, só se `entrada_modalidade = 'parcelado'`
— renegociar entrada "à vista" não é permitido, o botão simplesmente não
aparece nesse caso):

1. A parcela original ganha `renegociada = true`.
2. O contador de parcelas daquele tipo sobe em 1 (`num_parcelas` pra tipo
   `tratamento`, `num_parcelas_entrada` pra tipo `entrada`).
3. `recalcular_parcelas_tratamento` é chamada de novo — como ela já preenche
   qualquer `numero` que esteja faltando usando a fórmula mensal a partir da
   data-âncora, e já pula (não sobrescreve) linhas com `renegociada = true`,
   ela mesma cria a parcela nova, na data certa, sem nenhum cálculo adicional
   de "maior data + 1 mês". A régua sendo estritamente mensal garante que o
   número novo sempre cai exatamente 1 mês depois do que era o último.
4. A parcela recém-criada recebe `parcela_original_id` apontando pra
   parcela original.

## Schema

```sql
alter table parcelas add column parcela_original_id uuid references parcelas(id);
```

Nula para toda parcela normal. Setada só na parcela "nova" criada por uma
renegociação, apontando pra parcela que ela substitui.

## Função `renegociar_parcela(p_parcela_id uuid)` (substitui a versão atual)

```sql
create or replace function renegociar_parcela(p_parcela_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_tratamento_id uuid;
  v_tipo text;
  v_modalidade text;
  v_novo_numero integer;
begin
  select tratamento_id, tipo into v_tratamento_id, v_tipo
  from parcelas where id = p_parcela_id;

  if not found then
    raise exception 'Parcela % não encontrada', p_parcela_id;
  end if;

  if v_tipo = 'entrada' then
    select entrada_modalidade into v_modalidade from tratamentos where id = v_tratamento_id;
    if v_modalidade = 'avista' then
      raise exception 'Não é possível renegociar uma entrada à vista';
    end if;
  end if;

  update parcelas set renegociada = true where id = p_parcela_id;

  if v_tipo = 'entrada' then
    update tratamentos set num_parcelas_entrada = num_parcelas_entrada + 1
    where id = v_tratamento_id
    returning num_parcelas_entrada into v_novo_numero;
  else
    update tratamentos set num_parcelas = num_parcelas + 1
    where id = v_tratamento_id
    returning num_parcelas into v_novo_numero;
  end if;

  perform recalcular_parcelas_tratamento(v_tratamento_id);

  update parcelas set parcela_original_id = p_parcela_id
  where tratamento_id = v_tratamento_id and tipo = v_tipo and numero = v_novo_numero;
end;
$function$;
```

A checagem de "à vista" é uma segunda camada de segurança — a UI já não
mostra o botão nesse caso, mas a função recusa mesmo assim se for chamada
diretamente.

## Função `desfazer_renegociacao(p_parcela_original_id uuid)` (nova, substitui o update direto do client)

```sql
create or replace function desfazer_renegociacao(p_parcela_original_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_tratamento_id uuid;
  v_tipo text;
  v_nova_parcela_id uuid;
  v_nova_numero integer;
  v_max_numero integer;
begin
  select tratamento_id, tipo into v_tratamento_id, v_tipo
  from parcelas where id = p_parcela_original_id;

  if not found then
    raise exception 'Parcela % não encontrada', p_parcela_original_id;
  end if;

  select id, numero into v_nova_parcela_id, v_nova_numero
  from parcelas where parcela_original_id = p_parcela_original_id;

  if not found then
    raise exception 'Nenhuma parcela de renegociação encontrada para %', p_parcela_original_id;
  end if;

  select max(numero) into v_max_numero
  from parcelas where tratamento_id = v_tratamento_id and tipo = v_tipo;

  if v_nova_numero <> v_max_numero then
    raise exception 'Não é possível desfazer: já existe uma renegociação mais recente depois desta';
  end if;

  delete from parcelas where id = v_nova_parcela_id;

  if v_tipo = 'entrada' then
    update tratamentos set num_parcelas_entrada = num_parcelas_entrada - 1 where id = v_tratamento_id;
  else
    update tratamentos set num_parcelas = num_parcelas - 1 where id = v_tratamento_id;
  end if;

  update parcelas set renegociada = false where id = p_parcela_original_id;
end;
$function$;
```

A UI também vai esconder/desabilitar o link "Desfazer" client-side quando a
parcela de renegociação não for mais a última (evita depender só do erro do
banco pra dar feedback), mas a função continua validando por segurança.

## Tela (`src/pages/Financeiro.jsx`)

Coluna "Renegociação" passa a ter 4 estados por linha:

| condição | o que aparece |
|---|---|
| `!paga && !renegociada && parcela_original_id === null` (e, se `tipo==='entrada'`, `entrada_modalidade !== 'avista'`) | botão "Renegociar" |
| `renegociada === true` | selo "Renegociada" + texto "→ parcela #N" (N = número da parcela que a substitui, achado localmente nos parcelas já carregados) + link "Desfazer" (visível só se essa parcela nova ainda for a última do tipo) |
| `parcela_original_id !== null` (esta é a parcela nova) | texto "Renegociação da parcela #M" (M = número da original), sem botão |
| `paga` e nenhuma das condições acima | célula vazia |

O checkbox "Paga" fica desabilitado quando `renegociada === true`.

Chamadas:
- Renegociar: `supabase.rpc("renegociar_parcela", { p_parcela_id: parcela.id })`.
- Desfazer: `supabase.rpc("desfazer_renegociacao", { p_parcela_original_id: parcela.id })` (chamado a partir da linha ORIGINAL, não da nova).

## Bug corrigido de brinde: data não atualiza na tela

O `<input type="date" defaultValue={p.data_vencimento} ...>` é não controlado;
quando `carregar()` busca dados novos e o React reconcilia a mesma linha (mesma
`key={p.id}`), o input não relê `defaultValue`. Fix: acrescentar
`key={p.data_vencimento}` no próprio `<input>`, forçando o React a desmontar e
remontar o campo sempre que a data mudar (por qualquer motivo — edição manual,
recálculo, ou renegociação), sem virar um input controlado.

## Migração do dado real da Alexandra (tratamento `df910ead-a6bb-493d-a86f-3527e7498d20`)

As parcelas 22, 23, 24 (tipo `tratamento`) estão hoje no modelo antigo:
`renegociada = true`, datas em 2027-07/08/09, sem parcela nova, `num_parcelas`
ainda em 36. Depois que as funções novas estiverem no ar, rodar (via MCP do
Supabase, em produção, com cuidado — não é dado de teste):

1. Zerar `renegociada` das 3 (pra virarem elegíveis de novo pro recálculo):
   `update parcelas set renegociada = false where tratamento_id = '...' and numero in (22,23,24);`
2. Rodar `recalcular_parcelas_tratamento` — isso devolve as 3 pra sequência
   normal (2026-04, 2026-05, 2026-06).
3. Chamar `renegociar_parcela` pra cada uma das 3, **em ordem** (22 primeiro,
   depois 23, depois 24) — cada chamada marca a original, sobe o contador, e
   cria a parcela nova correspondente (37, 38, 39, nessa ordem, caindo
   exatamente nas datas 2027-07/08/09 que essas 3 já ocupavam incorretamente
   hoje).
4. Conferir o resultado final com um `select` antes de considerar concluído.

## Fora de escopo

- Não mexe em Busca, ResumoCards, Financeiro (fora da tabela de parcelas) ou
  exportações CSV.
- Não lida com o caso de renegociar uma parcela que já é ela mesma uma
  "parcela nova" de outra renegociação — isso é permitido e funciona (vira uma
  cadeia original → nova → nova da nova), mas o encadeamento não precisa de
  tratamento especial: cada `renegociar_parcela` só olha pra parcela que foi
  clicada.
- Não migra automaticamente outros tratamentos que porventura tenham sido
  renegociados manualmente do jeito antigo além do da Alexandra (não há
  nenhum outro no banco atualmente).
