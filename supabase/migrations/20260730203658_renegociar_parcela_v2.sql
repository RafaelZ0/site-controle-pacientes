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
