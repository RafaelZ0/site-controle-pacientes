-- =========================================================
-- Geração automática de consultas e parcelas
-- =========================================================
-- Regras (lidas do resumo do brief — item 3; NÃO conferidas contra a
-- fórmula exata da célula M4 da aba "Modelo" porque o .xlsx original
-- não foi disponibilizado. Confirmar com o Pablo antes de usar em
-- produção com pacientes reais).
--
-- Consultas: distribuídas em intervalos uniformes ao longo de
-- num_parcelas meses, a partir de data_inicio.
--   mês da consulta i ≈ ROUND((i-1) * (num_parcelas-1) / (num_consultas-1))
-- A partir da consulta do implante (inclusive), soma-se +6 meses em
-- todas as consultas seguintes (cicatrização/osseointegração).
--
-- Parcelas: mensais a partir de data_inicio (parcela i = data_inicio + (i-1)
-- meses). Suposição confirmada com o usuário: o gap de 6 meses do implante
-- NÃO desloca o vencimento das parcelas, só as consultas — a "data de
-- finalização" (calculada na view pacientes_status) é que soma os 6 meses
-- por cima da última parcela quando há implante no plano.
create or replace function gerar_plano_paciente(p_paciente_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_paciente pacientes%rowtype;
  v_mes_offset integer;
  i integer;
begin
  select * into v_paciente from pacientes where id = p_paciente_id;
  if not found then
    raise exception 'Paciente % não encontrado', p_paciente_id;
  end if;

  delete from consultas where paciente_id = p_paciente_id;
  delete from parcelas where paciente_id = p_paciente_id;

  for i in 1..v_paciente.num_consultas loop
    if v_paciente.num_consultas = 1 then
      v_mes_offset := 0;
    else
      v_mes_offset := round(
        (i - 1)::numeric * (v_paciente.num_parcelas - 1) / (v_paciente.num_consultas - 1)
      );
    end if;

    if v_paciente.consulta_implante_numero is not null
       and i >= v_paciente.consulta_implante_numero then
      v_mes_offset := v_mes_offset + 6;
    end if;

    insert into consultas (paciente_id, numero, data_prevista)
    values (
      p_paciente_id,
      i,
      (v_paciente.data_inicio + (v_mes_offset || ' months')::interval)::date
    );
  end loop;

  for i in 1..v_paciente.num_parcelas loop
    insert into parcelas (paciente_id, numero, data_vencimento)
    values (
      p_paciente_id,
      i,
      (v_paciente.data_inicio + ((i - 1) || ' months')::interval)::date
    );
  end loop;
end;
$$;

-- Gera o plano automaticamente na criação do paciente.
-- Só na criação (INSERT), de propósito: se disparasse em todo UPDATE,
-- qualquer edição do paciente apagaria e recriaria consultas/parcelas,
-- perdendo o histórico de "realizada"/"paga" já registrado. Para
-- replanejar um paciente existente, chamar gerar_plano_paciente(id)
-- manualmente (ex: numa tela de "regenerar plano", se vocês quiserem
-- essa opção depois).
create or replace function trg_gerar_plano_paciente()
returns trigger
language plpgsql
as $$
begin
  perform gerar_plano_paciente(new.id);
  return new;
end;
$$;

create trigger after_insert_pacientes
  after insert on pacientes
  for each row
  execute function trg_gerar_plano_paciente();
