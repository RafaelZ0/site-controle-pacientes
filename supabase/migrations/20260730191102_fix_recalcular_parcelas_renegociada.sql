-- =========================================================
-- Fix: Preserve renegotiated parcelas during count-shrink cleanup
--
-- The two DELETE statements that clean up parcelas beyond the new
-- entrada/tratamento count now check `renegociada = false`. This
-- ensures that a renegotiated parcela is never deleted by the
-- count-shrink cleanup, even if its numero exceeds the new total.
--
-- Non-renegotiated parcelas (including already-paid ones) keep
-- the exact same delete behavior as before — this only carves out
-- an exception for `renegociada = true` rows.
-- =========================================================

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
      and numero > (case when v_tratamento.entrada_modalidade = 'avista' then 1 else v_tratamento.num_parcelas_entrada end)
      and renegociada = false;
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
      and numero > v_tratamento.num_parcelas
      and renegociada = false;
  end if;
end;
$function$;
