-- =========================================================
-- Observação por consulta + vínculo opcional etapa↔consulta + auto-
-- -completar consultas quando o paciente é dado como FINALIZADO.
-- =========================================================

alter table consultas add column if not exists observacao text;

alter table historico_etapas
  add column if not exists consulta_id uuid references consultas(id) on delete set null;

-- ---------------------------------------------------------
-- Ao registrar a etapa FINALIZADO, todas as consultas ainda em aberto
-- do paciente são dadas como realizadas automaticamente (data = a data
-- informada no registro da etapa). Parcelas NÃO são afetadas — pagamento
-- continua 100% manual, como já era.
-- ---------------------------------------------------------
create or replace function trg_historico_etapas_efeitos()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.etapa = 'IMPLANTE' then
    perform recalcular_plano_paciente(new.paciente_id);
  elsif new.etapa = 'FINALIZADO' then
    update consultas
    set realizada = true,
        data_realizada = coalesce(data_realizada, new.data),
        observacao = coalesce(observacao, 'Concluída automaticamente (tratamento finalizado).')
    where paciente_id = new.paciente_id
      and realizada = false;
  end if;
  return new;
end;
$$;

drop trigger if exists after_insert_historico_implante on historico_etapas;
drop trigger if exists after_insert_historico_etapas_efeitos on historico_etapas;

create trigger after_insert_historico_etapas_efeitos
  after insert on historico_etapas
  for each row
  execute function trg_historico_etapas_efeitos();

-- Superada pela função consolidada acima.
drop function if exists trg_historico_implante();
