# Design: opção "Renegociar" parcela

## Contexto

Hoje, quando uma parcela é renegociada (paciente atrasa e a parcela passa pra
depois de todas as outras), a funcionária edita a data de vencimento na mão
pra um valor bem à frente, sem nenhuma marcação — só quem editou sabe que
aquilo foi renegociação e não um erro de digitação (foi exatamente o que
aconteceu com as parcelas 22–24 do tratamento da paciente Alexandra Herculano,
movidas manualmente pra 2027-08, 2027-09 e 2027-10, depois da parcela 36 que
vencia em 2027-06). O usuário quer formalizar essa ação: um botão explícito
que joga a parcela pro final da fila e deixa isso visualmente evidente daqui
pra frente.

## Schema

Nova coluna em `parcelas`:

```sql
alter table parcelas add column renegociada boolean not null default false;
```

Migration nova em `supabase/migrations/`, aplicada via `apply_migration` (MCP
Supabase) — renomear o arquivo local pra bater com a `version` que o Supabase
atribuir (conferir com `list_migrations`).

## Função `renegociar_parcela(p_parcela_id uuid)`

```sql
create or replace function renegociar_parcela(p_parcela_id uuid)
returns void
language plpgsql
as $$
declare
  v_tratamento_id uuid;
  v_tipo text;
  v_max_vencimento date;
begin
  select tratamento_id, tipo into v_tratamento_id, v_tipo
  from parcelas where id = p_parcela_id;

  select max(data_vencimento) into v_max_vencimento
  from parcelas
  where tratamento_id = v_tratamento_id and tipo = v_tipo;

  update parcelas
  set data_vencimento = v_max_vencimento + interval '1 month',
      renegociada = true
  where id = p_parcela_id;
end;
$$;
```

Chamada do client via `supabase.rpc("renegociar_parcela", { p_parcela_id: parcela.id })`.

Entrada e tratamento continuam réguas independentes (decisão já fechada do
sistema) — o cálculo do "final da fila" olha só pras parcelas do mesmo
`tipo` daquele tratamento.

"Desfazer" não precisa de função: é um `update` direto do client pra
`renegociada = false`. A data de vencimento não volta ao que era — fica onde
a renegociação deixou, só o selo visual some.

## Tela (`src/pages/Financeiro.jsx`)

Nova coluna na tabela de parcelas (hoje: Tipo | # | Vencimento | Paga):

| condição da parcela | o que aparece na nova coluna |
|---|---|
| não paga e `renegociada = false` | botão "Renegociar" |
| `renegociada = true` | selo "Renegociada" (nova classe `.badge-renegociada`, cor `--status-info-bg`/`--status-info-text`, mesmo padrão dos outros badges) + link "Desfazer" |
| paga e nunca renegociada | célula vazia |

Ao clicar "Renegociar": chama a RPC, recarrega as parcelas (`carregar()`) e
mostra uma mensagem de info reaproveitando o padrão já usado em
`editarVencimento` — algo como `Parcela renegociada — novo vencimento: 05/07/2027.`

Ao clicar "Desfazer": `supabase.from("parcelas").update({ renegociada: false }).eq("id", parcela.id)`,
recarrega e mostra `Renegociação desfeita.`

O selo "Renegociada" continua visível mesmo se a parcela for marcada como
paga depois — é histórico, não se apaga sozinho.

## Fora de escopo

- Não mexe em Busca, ResumoCards, exportações de CSV nem na barra de
  progresso pagamento x procedimento (feature separada, spec
  `2026-07-30-progresso-pagamento-x-procedimento-design.md`).
- Não reordena `numero` das parcelas — o número da parcela continua sendo
  contagem de parcela, independente da ordem cronológica do vencimento
  (mesmo padrão já visto no caso real da Alexandra).
- Não recalcula automaticamente parcelas futuras quando uma é renegociada —
  só a parcela clicada se move.

## Teste

Antes de subir pra produção: criar tratamento `__TESTE_TEMP__` via MCP do
Supabase com algumas parcelas de teste, chamar `renegociar_parcela` numa
delas, conferir que a data bateu com "maior vencimento + 1 mês" e que o flag
ficou `true`, testar o "Desfazer", depois apagar todos os dados de teste.
