-- =========================================================
-- Suporte a dois "workspaces" no mesmo site: Clínica e Curso (aulas
-- presenciais de prótese sobre implantes, com pacientes e dupla de
-- dentistas próprios, que não atendem na clínica). Quem preenche os
-- dois é a mesma equipe de funcionários — não é login por aluno.
--
-- Separação é um filtro de consulta, não uma restrição de RLS: segue
-- o mesmo modelo de confiança total já documentado na migration 0001
-- (qualquer dentista autenticado já via "tudo" antes disso).
-- =========================================================

alter table pacientes add column workspace text not null default 'clinica'
  check (workspace in ('clinica', 'curso'));
alter table dentistas add column workspace text not null default 'clinica'
  check (workspace in ('clinica', 'curso'));
