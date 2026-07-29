-- =========================================================
-- Trigger esquecido na migration anterior: disparava em todo insert em
-- `pacientes` chamando gerar_plano_paciente(id) — função já removida
-- (o plano de tratamento agora nasce em `tratamentos`, via
-- after_insert_tratamentos_gera_consultas). Sem isso, cadastrar
-- qualquer paciente novo quebrava com "function gerar_plano_paciente
-- does not exist".
-- =========================================================

drop trigger if exists after_insert_pacientes on pacientes;
drop function if exists trg_gerar_plano_paciente();
