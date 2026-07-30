# Renegociar Parcela Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Renegociar" action to each unpaid parcela in the Financeiro tab that pushes it to the end of the payment queue (past every other parcela of the same tratamento/tipo) and marks it visibly, without that manual adjustment ever getting silently overwritten by the existing recalculation flow.

**Architecture:** A new `parcelas.renegociada` boolean flag, a new Postgres function `renegociar_parcela(p_parcela_id uuid)` that computes "current latest due date for that tratamento+tipo, plus one month" and applies it, and a small patch to the existing `recalcular_parcelas_tratamento` function so it skips (leaves untouched) any parcela already flagged `renegociada = true`. `Financeiro.jsx` gets a new table column wired to this RPC plus a client-side-only "undo" (clear the flag, no RPC needed).

**Tech Stack:** Vite + React (no TypeScript), Supabase-js, PL/pgSQL migrations applied through the Supabase MCP (`apply_migration`, `execute_sql`, `list_migrations`), plain CSS in `src/index.css`, `node --test` for pure-function unit tests.

## Global Constraints

- Supabase project id: `nuxqkmilyenfkjzsacqh`.
- Every schema/function change is a new file in `supabase/migrations/`, applied via the `apply_migration` MCP tool — after applying, rename the local file so its leading timestamp matches the `version` Supabase actually assigned (check with `list_migrations`).
- Never log in with real user credentials. All database-level testing happens directly through the Supabase MCP using throwaway rows named `__TESTE_TEMP__...`, and those rows must be deleted again once the test is done.
- `npm run build` must pass before any task is considered done.
- Direct commits/pushes to `main` are normal practice here — no need to ask permission per push, just report what was pushed.
- Entrada and tratamento parcelas are independent monthly rulers (different `tipo`) — never mix them when computing "the end of the queue".
- `numero` is an installment count, not a chronological ordering — never renumber parcelas as part of this feature.

---

### Task 1: Migration — `renegociada` column + `renegociar_parcela` function + patched `recalcular_parcelas_tratamento`

**Files:**
- Create: `supabase/migrations/<version>_renegociar_parcela.sql` (exact filename fixed in Step 4, once Supabase assigns the real `version`)

**Interfaces:**
- Produces: column `parcelas.renegociada boolean not null default false`; RPC `renegociar_parcela(p_parcela_id uuid) returns void`; updated RPC `recalcular_parcelas_tratamento(p_tratamento_id uuid) returns void` (same signature as before, behavior only changes for rows where `renegociada = true`).

- [ ] **Step 1: Apply the migration via the Supabase MCP**

Call the `apply_migration` MCP tool (`project_id: nuxqkmilyenfkjzsacqh`) with `name: renegociar_parcela` and this exact SQL:

```sql
alter table parcelas add column renegociada boolean not null default false;

create or replace function renegociar_parcela(p_parcela_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_tratamento_id uuid;
  v_tipo text;
  v_max_vencimento date;
begin
  select tratamento_id, tipo into v_tratamento_id, v_tipo
  from parcelas where id = p_parcela_id;

  if not found then
    raise exception 'Parcela % não encontrada', p_parcela_id;
  end if;

  select max(data_vencimento) into v_max_vencimento
  from parcelas
  where tratamento_id = v_tratamento_id and tipo = v_tipo;

  update parcelas
  set data_vencimento = (v_max_vencimento + interval '1 month')::date,
      renegociada = true
  where id = p_parcela_id;
end;
$function$;

create or replace function recalcular_parcelas_tratamento(p_tratamento_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_tratamento tratamentos%rowtype;
  i integer;
begin
  select * into v_tratamento from tratamentos where id = p_tratamento_id;
  if not found then
    raise exception 'Tratamento % não encontrado', p_tratamento_id;
  end if;
  if v_tratamento.entrada_vencimento is null then
    delete from parcelas where tratamento_id = p_tratamento_id and tipo = 'entrada';
  else
    for i in 1..(case when v_tratamento.entrada_modalidade = 'avista' then 1 else v_tratamento.num_parcelas_entrada end) loop
      insert into parcelas (tratamento_id, tipo, numero, data_vencimento)
      values (p_tratamento_id, 'entrada', i, (v_tratamento.entrada_vencimento + ((i - 1) || ' months')::interval)::date)
      on conflict (tratamento_id, tipo, numero) do update set data_vencimento = excluded.data_vencimento
      where parcelas.renegociada = false;
    end loop;
    delete from parcelas
    where tratamento_id = p_tratamento_id and tipo = 'entrada'
      and numero > (case when v_tratamento.entrada_modalidade = 'avista' then 1 else v_tratamento.num_parcelas_entrada end);
  end if;
  if v_tratamento.primeira_parcela_vencimento is null then
    delete from parcelas where tratamento_id = p_tratamento_id and tipo = 'tratamento';
  else
    for i in 1..v_tratamento.num_parcelas loop
      insert into parcelas (tratamento_id, tipo, numero, data_vencimento)
      values (p_tratamento_id, 'tratamento', i, (v_tratamento.primeira_parcela_vencimento + ((i - 1) || ' months')::interval)::date)
      on conflict (tratamento_id, tipo, numero) do update set data_vencimento = excluded.data_vencimento
      where parcelas.renegociada = false;
    end loop;
    delete from parcelas
    where tratamento_id = p_tratamento_id and tipo = 'tratamento'
      and numero > v_tratamento.num_parcelas;
  end if;
end;
$function$;
```

- [ ] **Step 2: Confirm it applied cleanly**

Call `execute_sql` (same `project_id`) with:

```sql
select column_name from information_schema.columns where table_name = 'parcelas' and column_name = 'renegociada';
select proname from pg_proc where proname in ('renegociar_parcela', 'recalcular_parcelas_tratamento');
```

Expected: one row for `renegociada`, and both function names present.

- [ ] **Step 3: Find the assigned migration version**

Call `list_migrations` (same `project_id`) and note the `version` of the migration you just applied (it will be the newest one, named `renegociar_parcela`).

- [ ] **Step 4: Write the local migration file with the matching name**

Create `supabase/migrations/<version>_renegociar_parcela.sql` (replace `<version>` with the exact value from Step 3) containing the same SQL from Step 1.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<version>_renegociar_parcela.sql
git commit -m "Adiciona renegociar_parcela e preserva parcelas renegociadas no recalculo"
```

---

### Task 2: Verify the migration end-to-end with throwaway data

**Files:** none (Supabase MCP calls only — no repo files touched in this task)

**Interfaces:**
- Consumes: `renegociar_parcela(p_parcela_id uuid)`, `recalcular_parcelas_tratamento(p_tratamento_id uuid)` from Task 1.

- [ ] **Step 1: Create a throwaway paciente + tratamento**

Call `execute_sql`:

```sql
insert into pacientes (nome_completo, workspace) values ('__TESTE_TEMP__ Renegociacao', 'clinica') returning id;
```

Note the returned `id` as `PACIENTE_ID`, then:

```sql
insert into tratamentos (paciente_id, data_inicio, primeira_parcela_vencimento, num_parcelas)
values ('PACIENTE_ID', '2030-01-01', '2030-01-05', 3) returning id;
```

Note the returned `id` as `TRATAMENTO_ID`.

- [ ] **Step 2: Generate the 3 baseline parcelas**

```sql
select recalcular_parcelas_tratamento('TRATAMENTO_ID');
select numero, data_vencimento, renegociada from parcelas where tratamento_id = 'TRATAMENTO_ID' and tipo = 'tratamento' order by numero;
```

Expected: numero 1/2/3 with `data_vencimento` 2030-01-05, 2030-02-05, 2030-03-05, all `renegociada = false`.

- [ ] **Step 3: Renegotiate parcela número 1**

```sql
select renegociar_parcela((select id from parcelas where tratamento_id = 'TRATAMENTO_ID' and tipo = 'tratamento' and numero = 1));
select numero, data_vencimento, renegociada from parcelas where tratamento_id = 'TRATAMENTO_ID' and tipo = 'tratamento' order by numero;
```

Expected: numero 1 now has `data_vencimento = 2030-04-05` (the previous max, 2030-03-05, plus one month) and `renegociada = true`. Numero 2 and 3 unchanged.

- [ ] **Step 4: Recalculate and confirm the renegotiated parcela survives**

```sql
select recalcular_parcelas_tratamento('TRATAMENTO_ID');
select numero, data_vencimento, renegociada from parcelas where tratamento_id = 'TRATAMENTO_ID' and tipo = 'tratamento' order by numero;
```

Expected: numero 1 is still `data_vencimento = 2030-04-05`, `renegociada = true` (untouched by the recalculation). Numero 2 and 3 still 2030-02-05 / 2030-03-05.

- [ ] **Step 5: Clean up the throwaway data**

```sql
delete from parcelas where tratamento_id = 'TRATAMENTO_ID';
delete from tratamentos where id = 'TRATAMENTO_ID';
delete from pacientes where id = 'PACIENTE_ID';
```

Confirm with a `select` that no `__TESTE_TEMP__` rows remain in `pacientes`.

---

### Task 3: `formatarDataBR` helper + unit test

**Files:**
- Modify: `src/lib/financeiro.js`
- Modify: `src/lib/financeiro.test.js`

**Interfaces:**
- Produces: `formatarDataBR(isoDate: string): string` — converts `"2027-08-05"` to `"05/08/2027"`. Used by Task 5 to build the "Parcela renegociada" info message.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/financeiro.test.js`:

```js
import { normalizarParcelasEntrada, formatarDataBR } from "./financeiro.js";

test("formatarDataBR converte data ISO para DD/MM/AAAA", () => {
  assert.equal(formatarDataBR("2027-08-05"), "05/08/2027");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test src/lib/financeiro.test.js`
Expected: FAIL — `formatarDataBR is not a function` (or `undefined`).

- [ ] **Step 3: Implement it**

Add to `src/lib/financeiro.js`:

```js
export function formatarDataBR(isoDate) {
  const [ano, mes, dia] = isoDate.split("-");
  return `${dia}/${mes}/${ano}`;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node --test src/lib/financeiro.test.js`
Expected: all tests pass, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiro.js src/lib/financeiro.test.js
git commit -m "Adiciona formatarDataBR para mensagens de vencimento"
```

---

### Task 4: CSS — `.badge-renegociada`

**Files:**
- Modify: `src/index.css:854-862` (right next to `.badge-adimplente` / `.badge-inadimplente`)

**Interfaces:**
- Produces: CSS class `badge-renegociada` (used together with the existing base `.badge` class, same pattern as `badge-adimplente`).

- [ ] **Step 1: Add the rule**

In `src/index.css`, right after the `.badge-inadimplente` block (around line 862), add:

```css
.badge-renegociada {
  background: var(--status-info-bg);
  color: var(--status-info-text);
}
```

- [ ] **Step 2: Run the build to confirm nothing broke**

Run: `npm run build`
Expected: build succeeds (CSS-only change, this just guards against a stray syntax error).

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "Adiciona badge-renegociada"
```

---

### Task 5: `Financeiro.jsx` — "Renegociar" column

**Files:**
- Modify: `src/pages/Financeiro.jsx`

**Interfaces:**
- Consumes: RPC `renegociar_parcela` (Task 1), `formatarDataBR` (Task 3), CSS classes `badge`, `badge-renegociada`, `btn-outline`, `link-botao` (Task 4 + pre-existing).
- Produces: no new exports — this is a leaf page component.

- [ ] **Step 1: Import the new helper**

At the top of `src/pages/Financeiro.jsx`, change:

```js
import { normalizarParcelasEntrada } from "../lib/financeiro";
```

to:

```js
import { normalizarParcelasEntrada, formatarDataBR } from "../lib/financeiro";
```

- [ ] **Step 2: Add the two handler functions**

Right after the existing `editarVencimento` function (around line 78), add:

```js
async function renegociarParcela(parcela) {
  setError(null); setInfo(null);
  const { error: rpcError } = await supabase.rpc("renegociar_parcela", { p_parcela_id: parcela.id });
  if (rpcError) { setError(rpcError.message); return; }
  const { data } = await supabase.from("parcelas").select("data_vencimento").eq("id", parcela.id).single();
  setInfo(`Parcela renegociada — novo vencimento: ${formatarDataBR(data.data_vencimento)}.`);
  carregar();
}

async function desfazerRenegociacao(parcela) {
  setError(null); setInfo(null);
  const { error: updateError } = await supabase.from("parcelas").update({ renegociada: false }).eq("id", parcela.id);
  if (updateError) { setError(updateError.message); return; }
  setInfo("Renegociação desfeita.");
  carregar();
}
```

- [ ] **Step 3: Add the table column header**

Change:

```jsx
<table className="cp-table financeiro-tabela"><thead><tr><th>Tipo</th><th>#</th><th>Vencimento</th><th>Paga</th></tr></thead><tbody>
```

to:

```jsx
<table className="cp-table financeiro-tabela"><thead><tr><th>Tipo</th><th>#</th><th>Vencimento</th><th>Paga</th><th>Renegociação</th></tr></thead><tbody>
```

- [ ] **Step 4: Add the table cell**

Change the row-rendering line (currently ending in `<td><label className="check-touch">...</label></td></tr>)`) to add a 5th `<td>` before the closing `</tr>`:

```jsx
{parcelasVisiveis.map((p) => <tr key={p.id} className={p.paga ? "cp-row-paga" : p.data_vencimento < hoje ? "cp-row-atrasada" : ""}><td>{TIPO_LABEL[p.tipo] ?? p.tipo}</td><td>{p.numero}</td><td><input className="vencimento-editavel" type="date" defaultValue={p.data_vencimento} onBlur={(e) => editarVencimento(p, e.target.value)} aria-label={`Vencimento da ${TIPO_LABEL[p.tipo]} ${p.numero}`} /></td><td><label className="check-touch"><input type="checkbox" checked={p.paga} onChange={() => toggleParcela(p)} /></label></td><td>{p.renegociada ? <><span className="badge badge-renegociada">Renegociada</span> <button type="button" className="link-botao" onClick={() => desfazerRenegociacao(p)}>Desfazer</button></> : !p.paga ? <button type="button" className="btn-outline" onClick={() => renegociarParcela(p)}>Renegociar</button> : null}</td></tr>)}
```

Also update the empty-state colspan, from:

```jsx
{parcelas.length === 0 && <tr><td colSpan={4} className="estado-vazio">
```

to:

```jsx
{parcelas.length === 0 && <tr><td colSpan={5} className="estado-vazio">
```

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Manual verification against real (throwaway) data**

Using the Supabase MCP, create another `__TESTE_TEMP__` tratamento with 2-3 parcelas (same recipe as Task 2, Steps 1-2), call `renegociar_parcela` on one of them directly through SQL, then re-read the row with `select * from parcelas where id = '...'` and confirm `renegociada = true` and the pushed-out date — this stands in for clicking the button, since logging into the real UI is not allowed in this environment. Delete the throwaway rows afterward.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Financeiro.jsx
git commit -m "Adiciona opcao de renegociar parcela na tela de Financeiro"
```

---

### Task 6: Push and report

**Files:** none

- [ ] **Step 1: Push to `main`**

```bash
git push
```

- [ ] **Step 2: Report to the user**

Summarize what shipped: the `renegociada` column and the two Postgres functions, the new "Renegociar"/"Desfazer" column in Financeiro, and that the recalculation of parcelas now leaves renegotiated ones untouched. Mention that this was verified with throwaway `__TESTE_TEMP__` data via the Supabase MCP, not through the real UI (no login used).
