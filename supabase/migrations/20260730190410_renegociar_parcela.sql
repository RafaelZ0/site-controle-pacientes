-- =========================================================
-- Adiciona coluna renegociada às parcelas e funções para
-- renegociar uma parcela individual preservando o seu estado
-- nas operações de recalcular parcelas do tratamento.
-- =========================================================

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
