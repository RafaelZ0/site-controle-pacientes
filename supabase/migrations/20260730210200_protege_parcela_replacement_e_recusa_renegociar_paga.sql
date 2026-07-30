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
    delete from parcelas where tratamento_id = p_tratamento_id and tipo = 'entrada' and renegociada = false and parcela_original_id is null;
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
      and renegociada = false
      and parcela_original_id is null;
  end if;
  if v_tratamento.primeira_parcela_vencimento is null then
    delete from parcelas where tratamento_id = p_tratamento_id and tipo = 'tratamento' and renegociada = false and parcela_original_id is null;
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
      and renegociada = false
      and parcela_original_id is null;
  end if;
end;
$function$;

create or replace function renegociar_parcela(p_parcela_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_tratamento_id uuid;
  v_tipo text;
  v_renegociada boolean;
  v_paga boolean;
  v_modalidade text;
  v_novo_numero integer;
begin
  select tratamento_id, tipo, renegociada, paga into v_tratamento_id, v_tipo, v_renegociada, v_paga
  from parcelas where id = p_parcela_id;

  if not found then
    raise exception 'Parcela % não encontrada', p_parcela_id;
  end if;

  if v_renegociada then
    raise exception 'Parcela % já foi renegociada', p_parcela_id;
  end if;

  if v_paga then
    raise exception 'Parcela já paga não pode ser renegociada';
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

create unique index if not exists parcelas_parcela_original_id_key on parcelas (parcela_original_id) where parcela_original_id is not null;
