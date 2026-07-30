create or replace function renegociar_parcela(p_parcela_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_tratamento_id uuid;
  v_tipo text;
  v_renegociada boolean;
  v_modalidade text;
  v_novo_numero integer;
begin
  select tratamento_id, tipo, renegociada into v_tratamento_id, v_tipo, v_renegociada
  from parcelas where id = p_parcela_id;

  if not found then
    raise exception 'Parcela % não encontrada', p_parcela_id;
  end if;

  if v_renegociada then
    raise exception 'Parcela % já foi renegociada', p_parcela_id;
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
