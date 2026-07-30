# Progresso Pagamento x Procedimento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second progress bar to the "Status do tratamento" tab that compares % of installments paid against % of treatment stages completed, so staff can see at a glance whether a patient's payments are running ahead of or behind the treatment's normal 80%-paid-at-completion pattern.

**Architecture:** A pure function `calcularProgressoPagamento` (new, in the existing `src/lib/financeiro.js`) does all the percentage/threshold math and is unit-tested directly. `HistoricoEtapas.jsx` gets one new data fetch (parcelas for the tratamento) and renders a second progress bar under the existing etapas bar, driven entirely by that pure function's output. No schema or database changes — everything is a derived, client-side calculation over data the app already has or can trivially fetch.

**Tech Stack:** Vite + React (plain JS, no TypeScript), Supabase-js, plain CSS in `src/index.css`, `node --test` for pure-function unit tests.

## Global Constraints

- No database/schema changes in this plan — this is 100% a client-side derived calculation.
- `percentProcedimento = (etapasRegistradas / totalEtapas) * 100`.
- `percentPago = totalParcelas > 0 ? (parcelasPagas / totalParcelas) * 100 : 0` — never divide by zero.
- `esperado = percentProcedimento * 0.8`.
- `diferenca = percentPago - esperado`.
- Color thresholds are strict inequalities: `diferenca > 15` → `"info"`, `diferenca < -15` → `"alerta"`, otherwise (including exactly `15` or `-15`) → `"neutro"`.
- The payment bar only renders when `totalParcelas > 0` — a tratamento with no parcelas generated yet shows only the existing etapas bar.
- Reuse existing CSS color variables verbatim: `--teal` for neutro, `--status-info-text` for info, `--status-alerta-text` for alerta. Do not invent new colors.
- This feature touches only `src/lib/financeiro.js`, `src/lib/financeiro.test.js`, `src/index.css`, and `src/pages/HistoricoEtapas.jsx`. It must not touch Busca, ResumoCards, Financeiro, or any CSV export.
- `npm run build` must pass before any task is considered done.
- Never log in with real credentials. Any database-level sanity check uses throwaway `__TESTE_TEMP__` rows created via the Supabase MCP (project id `nuxqkmilyenfkjzsacqh`), deleted again afterward.
- Direct commits/pushes to `main` are normal practice here — report what was pushed rather than asking permission per push.

---

### Task 1: `calcularProgressoPagamento` pure function + unit tests

**Files:**
- Modify: `src/lib/financeiro.js`
- Modify: `src/lib/financeiro.test.js`

**Interfaces:**
- Produces: `calcularProgressoPagamento({ etapasRegistradas, totalEtapas, parcelasPagas, totalParcelas }): { percentProcedimento: number, percentPago: number, esperado: number, diferenca: number, cor: "neutro" | "info" | "alerta" }`. Used by Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/financeiro.test.js` (alongside the existing `import` line, add `calcularProgressoPagamento` to the import):

```js
import { normalizarParcelasEntrada, formatarDataBR, calcularProgressoPagamento } from "./financeiro.js";

test("calcularProgressoPagamento: pagamento dentro do esperado é neutro", () => {
  const r = calcularProgressoPagamento({ etapasRegistradas: 5, totalEtapas: 10, parcelasPagas: 4, totalParcelas: 10 });
  assert.equal(r.percentProcedimento, 50);
  assert.equal(r.percentPago, 40);
  assert.equal(r.esperado, 40);
  assert.equal(r.diferenca, 0);
  assert.equal(r.cor, "neutro");
});

test("calcularProgressoPagamento: pagando mais rápido que o esperado é info", () => {
  const r = calcularProgressoPagamento({ etapasRegistradas: 5, totalEtapas: 10, parcelasPagas: 6, totalParcelas: 10 });
  assert.equal(r.percentPago, 60);
  assert.equal(r.esperado, 40);
  assert.equal(r.diferenca, 20);
  assert.equal(r.cor, "info");
});

test("calcularProgressoPagamento: pagamento atrasado é alerta", () => {
  const r = calcularProgressoPagamento({ etapasRegistradas: 5, totalEtapas: 10, parcelasPagas: 2, totalParcelas: 10 });
  assert.equal(r.percentPago, 20);
  assert.equal(r.esperado, 40);
  assert.equal(r.diferenca, -20);
  assert.equal(r.cor, "alerta");
});

test("calcularProgressoPagamento: sem parcelas geradas não divide por zero", () => {
  const r = calcularProgressoPagamento({ etapasRegistradas: 3, totalEtapas: 10, parcelasPagas: 0, totalParcelas: 0 });
  assert.equal(r.percentPago, 0);
  assert.ok(Number.isFinite(r.diferenca));
});

test("calcularProgressoPagamento: diferenca exatamente +15 ainda é neutro (limite estrito)", () => {
  const r = calcularProgressoPagamento({ etapasRegistradas: 10, totalEtapas: 10, parcelasPagas: 95, totalParcelas: 100 });
  assert.equal(r.esperado, 80);
  assert.equal(r.percentPago, 95);
  assert.equal(r.diferenca, 15);
  assert.equal(r.cor, "neutro");
});

test("calcularProgressoPagamento: diferenca exatamente -15 ainda é neutro (limite estrito)", () => {
  const r = calcularProgressoPagamento({ etapasRegistradas: 10, totalEtapas: 10, parcelasPagas: 65, totalParcelas: 100 });
  assert.equal(r.esperado, 80);
  assert.equal(r.percentPago, 65);
  assert.equal(r.diferenca, -15);
  assert.equal(r.cor, "neutro");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/c/controle-pacientes-instituto/.tools/node-v24.18.0-win-x64:$PATH" && node --test src/lib/financeiro.test.js`
Expected: FAIL — `calcularProgressoPagamento is not a function` (or `undefined`).

- [ ] **Step 3: Implement the function**

Add to `src/lib/financeiro.js`:

```js
export function calcularProgressoPagamento({ etapasRegistradas, totalEtapas, parcelasPagas, totalParcelas }) {
  const percentProcedimento = (etapasRegistradas / totalEtapas) * 100;
  const percentPago = totalParcelas > 0 ? (parcelasPagas / totalParcelas) * 100 : 0;
  const esperado = percentProcedimento * 0.8;
  const diferenca = percentPago - esperado;
  const cor = diferenca > 15 ? "info" : diferenca < -15 ? "alerta" : "neutro";
  return { percentProcedimento, percentPago, esperado, diferenca, cor };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/c/controle-pacientes-instituto/.tools/node-v24.18.0-win-x64:$PATH" && node --test src/lib/financeiro.test.js`
Expected: all tests pass (the 2 pre-existing tests plus the 6 new ones — 8 total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro.js src/lib/financeiro.test.js
git commit -m "Adiciona calcularProgressoPagamento (pagamento x procedimento)"
```

---

### Task 2: CSS — `.pagamento-progresso*` classes

**Files:**
- Modify: `src/index.css:1116-1147` (right after the existing `.etapas-progresso*` block)

**Interfaces:**
- Produces: CSS classes `pagamento-progresso`, `pagamento-progresso-trilho`, `pagamento-progresso-preenchido`, `pagamento-progresso-preenchido--info`, `pagamento-progresso-preenchido--alerta`, `pagamento-progresso-texto`. Used by Task 3.

- [ ] **Step 1: Add the rules**

In `src/index.css`, right after the existing `.etapas-progresso-texto` block (ends around line 1147), add:

```css
.pagamento-progresso {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0 1rem;
}

.pagamento-progresso-trilho {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}

.pagamento-progresso-preenchido {
  height: 100%;
  background: var(--teal);
  border-radius: 999px;
  transition: width 0.2s ease;
}

.pagamento-progresso-preenchido--info {
  background: var(--status-info-text);
}

.pagamento-progresso-preenchido--alerta {
  background: var(--status-alerta-text);
}

.pagamento-progresso-texto {
  font-size: 0.78rem;
  color: var(--text-secondary);
  white-space: nowrap;
}
```

- [ ] **Step 2: Run the build to confirm nothing broke**

Run: `export PATH="/c/controle-pacientes-instituto/.tools/node-v24.18.0-win-x64:$PATH" && npm run build`
Expected: build succeeds (CSS-only change, this just guards against a stray syntax error).

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "Adiciona classes CSS da barra de progresso pagamento x procedimento"
```

---

### Task 3: `HistoricoEtapas.jsx` — render the payment progress bar

**Files:**
- Modify: `src/pages/HistoricoEtapas.jsx`

**Interfaces:**
- Consumes: `calcularProgressoPagamento` from `../lib/financeiro` (Task 1); CSS classes from Task 2.
- Produces: no new exports — this is a leaf page component.

- [ ] **Step 1: Import the new function**

At the top of `src/pages/HistoricoEtapas.jsx`, add a new import line right after the existing `import { ETAPAS } from "../lib/constants";`:

```js
import { calcularProgressoPagamento } from "../lib/financeiro";
```

- [ ] **Step 2: Add state and fetch the parcelas**

Add a new state declaration right after the existing `const [consultas, setConsultas] = useState([]);` (around line 14):

```js
const [parcelas, setParcelas] = useState([]);
```

Inside the existing `useEffect` (the one that fetches `dentistas`, the tratamento's paciente info, and `consultas` — currently lines 33-59), add one more fetch in the same fire-and-forget `.then()` style, right after the `consultas` fetch and before the `carregar();` call:

```js
supabase
  .from("parcelas")
  .select("paga")
  .eq("tratamento_id", tratamentoId)
  .then(({ data }) => setParcelas(data ?? []));
```

- [ ] **Step 3: Compute the progress values**

Right after the existing line `const etapasRegistradas = new Set(historico.map((h) => h.etapa)).size;` (around line 152), add:

```js
const totalParcelas = parcelas.length;
const parcelasPagas = parcelas.filter((p) => p.paga).length;
const progressoPagamento = calcularProgressoPagamento({
  etapasRegistradas,
  totalEtapas: ETAPAS.length,
  parcelasPagas,
  totalParcelas,
});
```

- [ ] **Step 4: Render the second bar**

Right after the closing `</div>` of the existing `.etapas-progresso` block (the block spanning current lines 159-169, ending with the `</div>` that closes `<span className="etapas-progresso-texto">...</span>` and its parent), add:

```jsx
{totalParcelas > 0 && (
  <div className="pagamento-progresso">
    <div className="pagamento-progresso-trilho">
      <div
        className={`pagamento-progresso-preenchido ${
          progressoPagamento.cor !== "neutro" ? `pagamento-progresso-preenchido--${progressoPagamento.cor}` : ""
        }`}
        style={{ width: `${progressoPagamento.percentPago}%` }}
      />
    </div>
    <span className="pagamento-progresso-texto">
      {Math.round(progressoPagamento.percentPago)}% pago (esperado ~{Math.round(progressoPagamento.esperado)}% nesta etapa)
    </span>
  </div>
)}
```

The full block, in context, should read:

```jsx
      <div className="etapas-progresso">
        <div className="etapas-progresso-trilho">
          <div
            className="etapas-progresso-preenchido"
            style={{ width: `${(etapasRegistradas / ETAPAS.length) * 100}%` }}
          />
        </div>
        <span className="etapas-progresso-texto">
          {etapasRegistradas} de {ETAPAS.length} etapas registradas
        </span>
      </div>

      {totalParcelas > 0 && (
        <div className="pagamento-progresso">
          <div className="pagamento-progresso-trilho">
            <div
              className={`pagamento-progresso-preenchido ${
                progressoPagamento.cor !== "neutro" ? `pagamento-progresso-preenchido--${progressoPagamento.cor}` : ""
              }`}
              style={{ width: `${progressoPagamento.percentPago}%` }}
            />
          </div>
          <span className="pagamento-progresso-texto">
            {Math.round(progressoPagamento.percentPago)}% pago (esperado ~{Math.round(progressoPagamento.esperado)}% nesta etapa)
          </span>
        </div>
      )}

      <div className="etapas-chips">
```

- [ ] **Step 5: Run the build**

Run: `export PATH="/c/controle-pacientes-instituto/.tools/node-v24.18.0-win-x64:$PATH" && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Sanity-check the parcelas query shape against real data**

There is no way to log into the running app in this environment (no test credentials, and using real credentials is forbidden), so this step validates the data shape the query returns, not the rendered pixels. Using the Supabase MCP (`project_id: nuxqkmilyenfkjzsacqh`):

1. Create a throwaway paciente + tratamento:
```sql
insert into pacientes (nome_completo, workspace) values ('__TESTE_TEMP__ ProgressoBarra', 'clinica') returning id;
```
Note the `id` as `PACIENTE_ID`, then:
```sql
insert into tratamentos (paciente_id, data_inicio, primeira_parcela_vencimento, num_parcelas)
values ('PACIENTE_ID', '2030-01-01', '2030-01-05', 10) returning id;
```
Note the `id` as `TRATAMENTO_ID`.

2. Generate the 10 parcelas and mark 4 of them paid:
```sql
select recalcular_parcelas_tratamento('TRATAMENTO_ID');
update parcelas set paga = true, data_pagamento = '2030-01-01' where tratamento_id = 'TRATAMENTO_ID' and tipo = 'tratamento' and numero <= 4;
```

3. Add 5 historico_etapas rows (5 distinct etapas) so `etapasRegistradas = 5`:
```sql
insert into historico_etapas (tratamento_id, etapa, data) values
  ('TRATAMENTO_ID', 'AVALIAÇÃO', '2030-01-01'),
  ('TRATAMENTO_ID', 'EM TRATAMENTO', '2030-02-01'),
  ('TRATAMENTO_ID', 'MOLDAGEM', '2030-03-01'),
  ('TRATAMENTO_ID', 'PROVA', '2030-04-01'),
  ('TRATAMENTO_ID', 'ENTREGA', '2030-05-01');
```

4. Run the exact query the component runs and confirm the shape:
```sql
select paga from parcelas where tratamento_id = 'TRATAMENTO_ID';
```
Expected: 10 rows, each `{ "paga": true }` or `{ "paga": false }` — exactly the shape `calcularProgressoPagamento` (via the component) expects (`.select("paga")`, not `.select("*")`). With 4 of 10 paid and 5 of 10 etapas registered, this matches Task 1's first test case exactly (`percentProcedimento: 50, percentPago: 40, esperado: 40, diferenca: 0, cor: "neutro"`) — confirming the real query result plugged into the already-tested pure function produces the expected "neutro" bar.

5. Clean up:
```sql
delete from parcelas where tratamento_id = 'TRATAMENTO_ID';
delete from historico_etapas where tratamento_id = 'TRATAMENTO_ID';
delete from tratamentos where id = 'TRATAMENTO_ID';
delete from pacientes where id = 'PACIENTE_ID';
```
Confirm with a `select` that no `__TESTE_TEMP__` rows remain in `pacientes`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/HistoricoEtapas.jsx
git commit -m "Renderiza barra de progresso pagamento x procedimento em HistoricoEtapas"
```

---

### Task 4: Push and report

**Files:** none

- [ ] **Step 1: Push to `main`**

```bash
git push
```

- [ ] **Step 2: Report to the user**

Summarize what shipped: `calcularProgressoPagamento` and its unit tests, the new CSS classes, and the second progress bar in the "Status do tratamento" tab comparing % pago against the etapas-based % procedimento (with the 80%-expected, ±15-point threshold coloring). Mention that this was verified with `npm run build`, the full `node --test` suite, and a throwaway `__TESTE_TEMP__` database check via the Supabase MCP — not through the real UI, since no login was used.
