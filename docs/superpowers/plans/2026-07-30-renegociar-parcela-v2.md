# Renegociar Parcela v2 (cria parcela nova) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Renegociar" mechanic already in production (which just moved a parcela's own due date) with the correct behavior: the original parcela stays in place, locked (badge, no "Paga" checkbox), and a brand-new payable parcela is created at the end of the queue, cross-referenced back to the original. Also fix a real display bug (stale date shown after reload) and migrate one real patient's data that was renegotiated under the old, now-replaced mechanic.

**Architecture:** A new `parcelas.parcela_original_id` column links a "replacement" parcela back to the original it supersedes. `renegociar_parcela` is rewritten to freeze the original, bump the tratamento's installment count, and let the *existing* `recalcular_parcelas_tratamento` (already skips `renegociada = true` rows) generate the missing row at the new count — which lands exactly one month after the previous last installment, because the whole ruler is a strict monthly sequence from an anchor date. A new `desfazer_renegociacao` function reverses this, refusing if a later renegotiation has already superseded it. `Financeiro.jsx` gets a 4-state "Renegociação" column and a small `key` fix on the date input.

**Tech Stack:** Vite + React (plain JS, no TypeScript), Supabase-js, PL/pgSQL migrations applied through the Supabase MCP (`apply_migration`, `execute_sql`, `list_migrations`).

## Global Constraints

- Supabase project id: `nuxqkmilyenfkjzsacqh`.
- This plan REPLACES the `renegociar_parcela` function shipped by the earlier plan (`docs/superpowers/plans/2026-07-30-renegociar-parcela.md`) — do not try to preserve its old "move the date" behavior anywhere.
- Every schema/function change is a new file in `supabase/migrations/`, applied via `apply_migration`, then the local file renamed to match the `version` Supabase actually assigned (check with `list_migrations`).
- Never log in with real credentials. Tasks 1-3 test exclusively through the Supabase MCP with throwaway `__TESTE_TEMP__` rows, deleted afterward. Task 4 is the one exception — it touches real production data for a real patient and must never be treated like a throwaway test.
- `numero` is never renumbered — a renegotiated parcela keeps its original `numero` forever; the new parcela gets the next sequential `numero`.
- Entrada and tratamento parcelas are independent monthly rulers (different `tipo`) — `num_parcelas` governs `tipo = 'tratamento'`, `num_parcelas_entrada` governs `tipo = 'entrada'`. Never mix them.
- Renegotiating an `entrada` parcela is only allowed when `entrada_modalidade = 'parcelado'` — never when `'avista'`.
- `npm run build` must pass before any code task is considered done.
- Direct commits/pushes to `main` are normal practice here — report what was pushed rather than asking permission per push.

---

### Task 1: Migration — `parcela_original_id` column + rewritten `renegociar_parcela` + new `desfazer_renegociacao`

**Files:**
- Create: `supabase/migrations/<version>_renegociar_parcela_v2.sql` (exact filename fixed in Step 4, once Supabase assigns the real `version`)

**Interfaces:**
- Produces: column `parcelas.parcela_original_id uuid references parcelas(id)`, nullable; rewritten RPC `renegociar_parcela(p_parcela_id uuid) returns void`; new RPC `desfazer_renegociacao(p_parcela_original_id uuid) returns void`.

- [ ] **Step 1: Apply the migration via the Supabase MCP**

Call `apply_migration` (`project_id: nuxqkmilyenfkjzsacqh`, `name: renegociar_parcela_v2`) with this exact SQL:

```sql
alter table parcelas add column parcela_original_id uuid references parcelas(id);

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

- [ ] **Step 2: Confirm it applied cleanly**

Call `execute_sql`:

```sql
select column_name from information_schema.columns where table_name = 'parcelas' and column_name = 'parcela_original_id';
select proname from pg_proc where proname in ('renegociar_parcela', 'desfazer_renegociacao');
```

Expected: one row for `parcela_original_id`, and both function names present.

- [ ] **Step 3: Find the assigned migration version**

Call `list_migrations` and note the `version` of the migration you just applied (named `renegociar_parcela_v2`).

- [ ] **Step 4: Write the local migration file with the matching name**

Create `supabase/migrations/<version>_renegociar_parcela_v2.sql` (replace `<version>` with the exact value from Step 3) containing the same SQL from Step 1.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<version>_renegociar_parcela_v2.sql
git commit -m "Renegociar parcela v2: cria parcela nova em vez de mover a existente"
```

---

### Task 2: Verify the new mechanic end-to-end with throwaway data

**Files:** none (Supabase MCP calls only)

**Interfaces:**
- Consumes: `renegociar_parcela(p_parcela_id uuid)`, `desfazer_renegociacao(p_parcela_original_id uuid)` from Task 1.

- [ ] **Step 1: Create a throwaway paciente + tratamento with 3 tratamento-tipo parcelas**

```sql
insert into pacientes (nome_completo, workspace) values ('__TESTE_TEMP__ RenegociarV2', 'clinica') returning id;
```
Note the `id` as `PACIENTE_ID`.

```sql
insert into tratamentos (paciente_id, data_inicio, primeira_parcela_vencimento, num_parcelas)
values ('PACIENTE_ID', '2030-01-01', '2030-01-05', 3) returning id;
```
Note the `id` as `TRATAMENTO_ID`.

```sql
select recalcular_parcelas_tratamento('TRATAMENTO_ID');
select id, numero, data_vencimento, renegociada, parcela_original_id from parcelas where tratamento_id = 'TRATAMENTO_ID' and tipo = 'tratamento' order by numero;
```
Expected: 3 rows, numero 1/2/3, dates 2030-01-05/02-05/03-05, all `renegociada = false`, all `parcela_original_id = null`. Note numero 2's `id` as `PARCELA_2_ID`.

- [ ] **Step 2: Renegotiate parcela número 2 and verify the new row**

```sql
select renegociar_parcela('PARCELA_2_ID');
select id, numero, data_vencimento, renegociada, parcela_original_id from parcelas where tratamento_id = 'TRATAMENTO_ID' and tipo = 'tratamento' order by numero;
select num_parcelas from tratamentos where id = 'TRATAMENTO_ID';
```
Expected: numero 2 unchanged date (2030-02-05), `renegociada = true`, `parcela_original_id = null` (it's the original, not a replacement). A new numero 4 row exists with `data_vencimento = 2030-04-05` (one month after numero 3's 2030-03-05), `renegociada = false`, `parcela_original_id = PARCELA_2_ID`. `tratamentos.num_parcelas` is now 4. Note numero 4's `id` as `PARCELA_4_ID`.

- [ ] **Step 3: Renegotiate parcela número 3 too, then verify "desfazer" refuses the superseded one**

```sql
select renegociar_parcela((select id from parcelas where tratamento_id = 'TRATAMENTO_ID' and tipo = 'tratamento' and numero = 3));
select id, numero, data_vencimento, renegociada, parcela_original_id from parcelas where tratamento_id = 'TRATAMENTO_ID' and tipo = 'tratamento' order by numero;
```
Expected: a new numero 5 row appears, `data_vencimento = 2030-05-05`, referencing numero 3's parcela. `num_parcelas` is now 5.

```sql
select desfazer_renegociacao('PARCELA_2_ID');
```
Expected: this call FAILS with an error containing "já existe uma renegociação mais recente depois desta" — because numero 4 (the replacement for parcela 2) is no longer the highest numero (numero 5 is).

- [ ] **Step 4: Undo the most recent renegotiation successfully**

```sql
select desfazer_renegociacao((select id from parcelas where tratamento_id = 'TRATAMENTO_ID' and tipo = 'tratamento' and numero = 3));
select id, numero, data_vencimento, renegociada, parcela_original_id from parcelas where tratamento_id = 'TRATAMENTO_ID' and tipo = 'tratamento' order by numero;
select num_parcelas from tratamentos where id = 'TRATAMENTO_ID';
```
Expected: numero 5 is gone. Numero 3 is back to `renegociada = false`. `num_parcelas` is back to 4. Numero 4 (parcela 2's replacement) is untouched.

- [ ] **Step 5: Verify renegotiating an "avista" entrada is rejected**

```sql
update tratamentos set entrada_modalidade = 'avista', entrada_vencimento = '2030-01-01', num_parcelas_entrada = 1 where id = 'TRATAMENTO_ID';
select recalcular_parcelas_tratamento('TRATAMENTO_ID');
select renegociar_parcela((select id from parcelas where tratamento_id = 'TRATAMENTO_ID' and tipo = 'entrada' and numero = 1));
```
Expected: this call FAILS with an error containing "Não é possível renegociar uma entrada à vista".

- [ ] **Step 6: Clean up the throwaway data**

```sql
delete from parcelas where tratamento_id = 'TRATAMENTO_ID';
delete from tratamentos where id = 'TRATAMENTO_ID';
delete from pacientes where id = 'PACIENTE_ID';
```
Confirm with a `select count(*) from pacientes where nome_completo like '%__TESTE_TEMP%'` that it returns 0.

---

### Task 3: `Financeiro.jsx` — 4-state "Renegociação" column + locked checkbox + stale-date fix

**Files:**
- Modify: `src/pages/Financeiro.jsx`

**Interfaces:**
- Consumes: RPCs `renegociar_parcela` and `desfazer_renegociacao` (Task 1); the `parcela_original_id` and `renegociada` columns already come through the existing `select("*")` in `carregar()` — no query change needed.
- Produces: no new exports — leaf page component.

- [ ] **Step 1: Update `desfazerRenegociacao` to call the new RPC**

Replace the current body (which does a direct `update({ renegociada: false })`) with:

```js
async function desfazerRenegociacao(parcela) {
  setError(null); setInfo(null);
  const { error: rpcError } = await supabase.rpc("desfazer_renegociacao", { p_parcela_original_id: parcela.id });
  if (rpcError) { setError(rpcError.message); return; }
  setInfo("Renegociação desfeita.");
  carregar();
}
```

- [ ] **Step 2: Update `renegociarParcela`'s confirmation message**

The old version looked up the same parcela's own (now unchanged) `data_vencimento`, which is no longer the useful piece of information — what changed is that a *new* parcela was created. Replace the body with:

```js
async function renegociarParcela(parcela) {
  setError(null); setInfo(null);
  setRenegociandoId(parcela.id);
  try {
    const { error: rpcError } = await supabase.rpc("renegociar_parcela", { p_parcela_id: parcela.id });
    if (rpcError) { setError(rpcError.message); return; }
    const { data, error: selectError } = await supabase
      .from("parcelas")
      .select("numero, data_vencimento")
      .eq("parcela_original_id", parcela.id)
      .maybeSingle();
    if (selectError || !data) setInfo("Parcela renegociada.");
    else setInfo(`Parcela renegociada — nova parcela #${data.numero}, vencimento ${formatarDataBR(data.data_vencimento)}.`);
    carregar();
  } finally {
    setRenegociandoId(null);
  }
}
```

- [ ] **Step 3: Rewrite the table body to compute the 4-state column and fix the stale-date bug**

Replace the entire block from `<table className="cp-table financeiro-tabela">` through its closing `</table>` with:

```jsx
    <table className="cp-table financeiro-tabela"><thead><tr><th>Tipo</th><th>#</th><th>Vencimento</th><th>Paga</th><th>Renegociação</th></tr></thead><tbody>
      {parcelasVisiveis.map((p) => {
        const novaParcela = p.renegociada ? parcelas.find((x) => x.parcela_original_id === p.id) : null;
        const original = p.parcela_original_id ? parcelas.find((x) => x.id === p.parcela_original_id) : null;
        const maxNumeroMesmoTipo = Math.max(...parcelas.filter((x) => x.tipo === p.tipo).map((x) => x.numero));
        const podeDesfazer = novaParcela && novaParcela.numero === maxNumeroMesmoTipo;
        const entradaAVista = p.tipo === "entrada" && form.entrada_modalidade === "avista";
        return (
          <tr key={p.id} className={p.paga ? "cp-row-paga" : p.data_vencimento < hoje ? "cp-row-atrasada" : ""}>
            <td>{TIPO_LABEL[p.tipo] ?? p.tipo}</td>
            <td>{p.numero}</td>
            <td>
              <input
                key={p.data_vencimento}
                className="vencimento-editavel"
                type="date"
                defaultValue={p.data_vencimento}
                onBlur={(e) => editarVencimento(p, e.target.value)}
                aria-label={`Vencimento da ${TIPO_LABEL[p.tipo]} ${p.numero}`}
              />
            </td>
            <td>
              <label className="check-touch">
                <input type="checkbox" checked={p.paga} disabled={p.renegociada} onChange={() => toggleParcela(p)} />
              </label>
            </td>
            <td>
              {p.renegociada ? (
                <>
                  <span className="badge badge-renegociada">Renegociada</span>
                  {novaParcela && <span className="label-ajuda"> → parcela #{novaParcela.numero}</span>}
                  {podeDesfazer && (
                    <button type="button" className="link-botao" onClick={() => desfazerRenegociacao(p)}>Desfazer</button>
                  )}
                </>
              ) : p.parcela_original_id ? (
                <span className="label-ajuda">Renegociação da parcela #{original ? original.numero : "?"}</span>
              ) : !p.paga && !entradaAVista ? (
                <button type="button" className="btn-outline" onClick={() => renegociarParcela(p)} disabled={renegociandoId === p.id}>
                  {renegociandoId === p.id ? "Renegociando..." : "Renegociar"}
                </button>
              ) : null}
            </td>
          </tr>
        );
      })}
      {parcelas.length === 0 && <tr><td colSpan={5} className="estado-vazio"><div className="estado-vazio-conteudo"><span>Nenhuma parcela ainda — preencha o formulário acima.</span></div></td></tr>}
    </tbody></table>
```

Note the `key={p.data_vencimento}` added to the date `<input>` — this is the stale-date fix: whenever this parcela's `data_vencimento` changes for any reason (manual edit, recalculation, or a renegotiation elsewhere in the tratamento), React now remounts this specific input instead of reusing the old DOM node, so it always shows the current value.

- [ ] **Step 4: Run the build**

Run: `export PATH="/c/controle-pacientes-instituto/.tools/node-v24.18.0-win-x64:$PATH" && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Manual verification against throwaway data**

Using the Supabase MCP, create another `__TESTE_TEMP__` tratamento with 2-3 tratamento-tipo parcelas (same recipe as Task 2, Step 1), renegotiate one via direct SQL call to `renegociar_parcela`, then re-read both the original and the new row with a `select`, confirming `renegociada = true` / `parcela_original_id` populated — this stands in for clicking the button, since logging into the real UI is not possible in this environment. Delete the throwaway rows afterward.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Financeiro.jsx
git commit -m "Financeiro: renegociar cria parcela nova, trava a original, corrige data desatualizada na tela"
```

---

### Task 4: Migrate Alexandra Herculano's real data to the new model

**Files:** none (Supabase MCP calls only — this is a one-time data fix on REAL production data, not a throwaway test. Do not name anything `__TESTE_TEMP__` here, and do not skip the verification `select` between steps.)

**Interfaces:**
- Consumes: `renegociar_parcela(p_parcela_id uuid)` from Task 1, already applied to production by Task 1.

- [ ] **Step 1: Confirm the current (old-model) state before touching anything**

```sql
select id, numero, data_vencimento, paga, renegociada, parcela_original_id
from parcelas
where tratamento_id = 'df910ead-a6bb-493d-a86f-3527e7498d20' and tipo = 'tratamento' and numero in (21, 22, 23, 24, 25, 36)
order by numero;
```
Expected (this is the known current state): numero 21 → 2026-03-05 paga; numero 22/23/24 → 2027-07-05/2027-08-05/2027-09-05 (or similar, depending on what was last set), `renegociada = true`, `parcela_original_id = null`; numero 25 → 2026-07-05 paga; numero 36 → 2027-06-05. Note the `id`s of numero 22, 23, 24 as `ORIG_22_ID`, `ORIG_23_ID`, `ORIG_24_ID`.

Also confirm the current count:
```sql
select num_parcelas from tratamentos where id = 'df910ead-a6bb-493d-a86f-3527e7498d20';
```
Expected: 36.

- [ ] **Step 2: Reset numero 22, 23, 24 to non-renegotiated so they become eligible for recalculation**

```sql
update parcelas set renegociada = false
where tratamento_id = 'df910ead-a6bb-493d-a86f-3527e7498d20' and tipo = 'tratamento' and numero in (22, 23, 24);

select recalcular_parcelas_tratamento('df910ead-a6bb-493d-a86f-3527e7498d20');

select numero, data_vencimento, renegociada from parcelas
where tratamento_id = 'df910ead-a6bb-493d-a86f-3527e7498d20' and tipo = 'tratamento' and numero in (22, 23, 24)
order by numero;
```
Expected: numero 22 → 2026-04-05, numero 23 → 2026-05-05, numero 24 → 2026-06-05, all `renegociada = false` now — back to the normal monthly sequence.

- [ ] **Step 3: Renegotiate 22, 23, 24 through the new mechanic, in that exact order**

```sql
select renegociar_parcela('ORIG_22_ID');
select renegociar_parcela('ORIG_23_ID');
select renegociar_parcela('ORIG_24_ID');
```

- [ ] **Step 4: Verify the final result**

```sql
select numero, data_vencimento, paga, renegociada, parcela_original_id
from parcelas
where tratamento_id = 'df910ead-a6bb-493d-a86f-3527e7498d20' and tipo = 'tratamento'
order by numero;

select num_parcelas from tratamentos where id = 'df910ead-a6bb-493d-a86f-3527e7498d20';
```
Expected:
- Numero 22, 23, 24: `renegociada = true`, dates back at 2026-04-05/05-05/06-05.
- Three new rows at numero 37, 38, 39 with dates 2027-07-05, 2027-08-05, 2027-09-05 respectively (continuing the monthly sequence from numero 36's 2027-06-05), each `parcela_original_id` pointing to numero 22, 23, 24 respectively (verify by joining or by checking each new row's `parcela_original_id` against `ORIG_22_ID`/`ORIG_23_ID`/`ORIG_24_ID`).
- `num_parcelas` is now 39.
- No other numero (1-21, 25-36) changed from Task 4 Step 1's baseline.

If anything doesn't match, stop and report — do not attempt further automated correction on real patient data without checking in.

---

### Task 5: Push and report

**Files:** none

- [ ] **Step 1: Push to `main`**

```bash
git push
```

- [ ] **Step 2: Report to the user**

Summarize: the new `parcela_original_id` column, the rewritten `renegociar_parcela` (now creates a new parcela instead of moving the existing one, and refuses on "avista" entrada), the new `desfazer_renegociacao` RPC (refuses when superseded by a later renegotiation), the 4-state "Renegociação" column in Financeiro.jsx, the locked "Paga" checkbox on renegotiated originals, the stale-date display fix, and that Alexandra Herculano's real parcelas 22/23/24 were migrated to the new model (now `num_parcelas = 39`). Mention this was verified with throwaway `__TESTE_TEMP__` data via the Supabase MCP for the mechanic itself (Tasks 2-3), and with careful step-by-step verification on the real data for Task 4 — not through the real UI, since no login was used.
