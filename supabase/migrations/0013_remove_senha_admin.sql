-- =========================================================
-- Remove a exigência de senha de administrador em qualquer lugar
-- (exclusão de paciente, criação/edição de dentista) — a pedido
-- explícito do usuário. Volta pro modelo de confiança total entre a
-- equipe da clínica já documentado na migration 0001: qualquer
-- dentista autenticado insere/edita/exclui direto via
-- supabase.from(...), sem RPC nem senha.
--
-- A tabela admin_config fica órfã (não é usada por nenhuma função
-- depois desta migration) — não foi apagada de propósito, caso o
-- usuário queira limpar isso manualmente depois.
-- =========================================================

drop policy "bloquear exclusao direta de paciente" on pacientes;
drop policy "bloquear insert direto de dentistas" on dentistas;
drop policy "bloquear update direto de dentistas" on dentistas;

drop function if exists excluir_paciente_admin(uuid, text);
drop function if exists criar_dentista_admin(text, text);
drop function if exists editar_dentista_admin(uuid, text, boolean, text);
