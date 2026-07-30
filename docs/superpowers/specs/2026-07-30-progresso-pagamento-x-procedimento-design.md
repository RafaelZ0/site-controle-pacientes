# Design: barra de progresso pagamento x procedimento

## Contexto

Na Clínica, a experiência histórica é que um tratamento normalmente termina
(chega em FINALIZADO) com **cerca de 80% das parcelas pagas** — o restante
costuma ser quitado depois. O usuário usa essa proporção como base pra
projeção financeira e quer um jeito visual de comparar, tratamento a
tratamento, se o pagamento está avançando rápido ou devagar demais em relação
ao andamento do procedimento.

## Onde aparece

Só na aba "Status do tratamento" de [PacienteEditar.jsx](../../../src/pages/PacienteEditar.jsx),
dentro de [HistoricoEtapas.jsx](../../../src/pages/HistoricoEtapas.jsx). Não afeta
Busca, ResumoCards, Financeiro nem exportações de CSV.

## Dados e cálculo

`HistoricoEtapas.jsx` já calcula, pro `tratamentoId` recebido:

```js
const etapasRegistradas = new Set(historico.map((h) => h.etapa)).size;
// barra existente: (etapasRegistradas / ETAPAS.length) * 100
```

Vai ganhar uma segunda busca, das parcelas do mesmo tratamento (entrada +
tratamento juntas, sem distinguir tipo):

```js
supabase.from("parcelas").select("paga").eq("tratamento_id", tratamentoId)
```

Com isso:

- `percentProcedimento = (etapasRegistradas / ETAPAS.length) * 100`
- `percentPago = (parcelasPagas / totalParcelas) * 100` (se `totalParcelas === 0`, a barra de pagamento não é renderizada)
- `esperado = percentProcedimento * 0.8`
- `diferenca = percentPago - esperado`

## Regra de cor da barra de pagamento

| condição | cor | significado |
|---|---|---|
| `-15 <= diferenca <= 15` | `--status-andamento` (teal, mesma cor da barra de etapas) | dentro do esperado |
| `diferenca > 15` | `--status-info` (azul) | pagando mais rápido que o esperado — informativo, não é erro |
| `diferenca < -15` | `--status-alerta` (vermelho) | pagamento atrasado em relação ao andamento do tratamento |

Reaproveita variáveis de cor já existentes em `index.css` — nenhuma cor nova.

## UI

Logo abaixo da barra de etapas já existente (`.etapas-progresso`), uma
segunda barra com a mesma estrutura visual (`trilho` + `preenchido`), com um
texto abaixo no formato:

```
{percentPago}% pago (esperado ~{esperado}% nesta etapa)
```

Novas classes CSS espelhando `.etapas-progresso*`, com modificador de cor
aplicado inline via `style.background` (ou uma classe `.progresso-pagamento--info` /
`--alerta`) conforme a condição acima.

## Casos de borda

- `totalParcelas === 0` (tratamento sem parcelas geradas ainda, ex.: configuração pendente): não renderiza a barra de pagamento, só a de etapas (já existente).
- `etapasRegistradas === 0` (nenhuma etapa registrada ainda): `esperado = 0`; qualquer parcela paga já entra como "adiantado", mas como cada parcela individual costuma ser uma fração pequena do total, isso não deve gerar falso alarme visualmente incômodo na prática.

## Fora de escopo

- Não mexe em Busca, ResumoCards, Financeiro ou exportações CSV.
- Não introduz valor monetário (parcelas continuam sem campo de valor, só contagem).
- Não persiste nada no banco — é um cálculo derivado, feito no client a partir de dados já buscados.
