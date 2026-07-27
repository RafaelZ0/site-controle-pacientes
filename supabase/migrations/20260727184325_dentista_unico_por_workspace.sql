-- =========================================================
-- Nome de dentista deve ser único por workspace, não globalmente.
-- Clínica e Curso são contextos separados (times diferentes) e não
-- faziam sentido compartilhar esse unique — impedia cadastrar o mesmo
-- nome em workspaces distintos.
-- =========================================================

alter table dentistas drop constraint dentistas_nome_key;
alter table dentistas add constraint dentistas_nome_workspace_key unique (nome, workspace);
