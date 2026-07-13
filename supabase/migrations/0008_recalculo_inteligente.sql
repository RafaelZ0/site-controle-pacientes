-- =========================================================
-- recalcular_plano_paciente: recálculo "inteligente" usado quando o
-- dentista edita data_inicio/num_parcelas/num_consultas/consulta_implante
-- de um paciente que já tem consultas/parcelas em andamento.
--
-- Diferente de gerar_plano_paciente (que apaga e recria tudo do zero, só
-- usado na criação do paciente ou no botão manual "Regenerar plano"),
-- esta função:
--   1. NUNCA sobrescreve linhas com realizada=true / paga=true.
--   2. Recalcula as linhas em aberto ANCORADAS na última concluída/paga:
--      acha o deslocamento (drift) entre a data real da última concluída
--      e a data que a fórmula original preveria pra ela, e aplica esse
--      mesmo drift a todas as posições em aberto — preserva o "formato"
--      da distribuição original mas sem inverter a ordem cronológica
--      com o que já aconteceu.
--   3. Se o novo num_consultas/num_parcelas for menor que a quantidade já
--      concluída/paga, essas linhas já concluídas são mantidas mesmo
--      excedendo o novo total (nunca apagamos histórico real); só as
--      linhas em aberto além do novo total são removidas.
-- =========================================================

create or replace function recalcular_plano_paciente(p_paciente_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_paciente pacientes%rowtype;
  v_k_consulta integer;
  v_k_parcela integer;
  v_anchor_consulta date;
  v_anchor_parcela date;
  v_anchor_offset integer;
  v_drift_consulta integer;
  v_drift_parcela integer;
  v_offset integer;
  i integer;
begin
  select * into v_paciente from pacientes where id = p_paciente_id;
  if not found then
    raise exception 'Paciente % não encontrado', p_paciente_id;
  end if;

  -- ===================== Consultas =====================
  select max(numero) into v_k_consulta
  from consultas
  where paciente_id = p_paciente_id and realizada = true;
  v_k_consulta := coalesce(v_k_consulta, 0);

  if v_k_consulta = 0 then
    v_drift_consulta := 0;
  else
    select coalesce(data_realizada, data_prevista) into v_anchor_consulta
    from consultas
    where paciente_id = p_paciente_id and numero = v_k_consulta;

    v_anchor_offset :=
      (extract(year from v_anchor_consulta)::int - extract(year from v_paciente.data_inicio)::int) * 12
      + (extract(month from v_anchor_consulta)::int - extract(month from v_paciente.data_inicio)::int);

    if v_paciente.num_consultas = 1 then
      v_offset := 0;
    else
      v_offset := round(
        (v_k_consulta - 1)::numeric * (v_paciente.num_parcelas - 1) / (v_paciente.num_consultas - 1)
      );
    end if;
    if v_paciente.consulta_implante_numero is not null
       and v_k_consulta >= v_paciente.consulta_implante_numero then
      v_offset := v_offset + 6;
    end if;

    v_drift_consulta := v_anchor_offset - v_offset;
  end if;

  for i in 1..v_paciente.num_consultas loop
    if not exists (
      select 1 from consultas
      where paciente_id = p_paciente_id and numero = i and realizada = true
    ) then
      if v_paciente.num_consultas = 1 then
        v_offset := 0;
      else
        v_offset := round(
          (i - 1)::numeric * (v_paciente.num_parcelas - 1) / (v_paciente.num_consultas - 1)
        );
      end if;
      if v_paciente.consulta_implante_numero is not null
         and i >= v_paciente.consulta_implante_numero then
        v_offset := v_offset + 6;
      end if;

      insert into consultas (paciente_id, numero, data_prevista)
      values (
        p_paciente_id, i,
        (v_paciente.data_inicio + ((v_offset + v_drift_consulta) || ' months')::interval)::date
      )
      on conflict (paciente_id, numero) do update
        set data_prevista = excluded.data_prevista
        where consultas.realizada = false;
    end if;
  end loop;

  delete from consultas
  where paciente_id = p_paciente_id
    and numero > v_paciente.num_consultas
    and realizada = false;

  -- ===================== Parcelas =====================
  select max(numero) into v_k_parcela
  from parcelas
  where paciente_id = p_paciente_id and paga = true;
  v_k_parcela := coalesce(v_k_parcela, 0);

  if v_k_parcela = 0 then
    v_drift_parcela := 0;
  else
    select coalesce(data_pagamento, data_vencimento) into v_anchor_parcela
    from parcelas
    where paciente_id = p_paciente_id and numero = v_k_parcela;

    v_anchor_offset :=
      (extract(year from v_anchor_parcela)::int - extract(year from v_paciente.data_inicio)::int) * 12
      + (extract(month from v_anchor_parcela)::int - extract(month from v_paciente.data_inicio)::int);

    v_drift_parcela := v_anchor_offset - (v_k_parcela - 1);
  end if;

  for i in 1..v_paciente.num_parcelas loop
    if not exists (
      select 1 from parcelas
      where paciente_id = p_paciente_id and numero = i and paga = true
    ) then
      insert into parcelas (paciente_id, numero, data_vencimento)
      values (
        p_paciente_id, i,
        (v_paciente.data_inicio + ((i - 1 + v_drift_parcela) || ' months')::interval)::date
      )
      on conflict (paciente_id, numero) do update
        set data_vencimento = excluded.data_vencimento
        where parcelas.paga = false;
    end if;
  end loop;

  delete from parcelas
  where paciente_id = p_paciente_id
    and numero > v_paciente.num_parcelas
    and paga = false;
end;
$$;
