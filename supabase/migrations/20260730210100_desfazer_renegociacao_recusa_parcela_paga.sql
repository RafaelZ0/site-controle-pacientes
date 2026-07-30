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
  v_nova_paga boolean;
  v_max_numero integer;
begin
  select tratamento_id, tipo into v_tratamento_id, v_tipo
  from parcelas where id = p_parcela_original_id;

  if not found then
    raise exception 'Parcela % não encontrada', p_parcela_original_id;
  end if;

  select id, numero, paga into v_nova_parcela_id, v_nova_numero, v_nova_paga
  from parcelas where parcela_original_id = p_parcela_original_id;

  if not found then
    raise exception 'Nenhuma parcela de renegociação encontrada para %', p_parcela_original_id;
  end if;

  if v_nova_paga then
    raise exception 'Não é possível desfazer: a parcela de renegociação já foi paga';
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
