-- =========================================================
-- Especialidade(s) do dentista, usado hoje só pelo Curso (alunos de
-- pós-graduação, cada um numa ou nas duas especialidades). Serve pra
-- não deixar montar dupla de dentista 1/2 com especialidades
-- incompatíveis (um ortodontista com um implantodontista).
-- =========================================================

alter table dentistas add column especialidades text[] not null default '{}';

alter table dentistas add constraint dentistas_especialidades_validas check (
  especialidades <@ array['ORTODONTIA', 'IMPLANTODONTIA']
);
