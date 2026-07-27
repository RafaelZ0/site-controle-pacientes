-- =========================================================
-- Unifica a fila de "Ajustes" com o histórico de etapas: em vez de uma
-- tabela paralela (solicitacoes_ajuste, da migration 0015), "Enviar
-- para ajustes" passa a ser só um registro da etapa AJUSTES em
-- historico_etapas — que já é a etapa oficial pra isso.
--
-- concluido default true: as demais etapas (MOLDAGEM, PROVA, etc.)
-- continuam sendo registros de algo que já aconteceu, sem mudar
-- comportamento pra elas. Só AJUSTES nasce com concluido = false (é a
-- única etapa que representa um trabalho pendente, não um fato já
-- ocorrido), setado explicitamente no insert pelo front-end.
-- =========================================================

alter table historico_etapas add column concluido boolean not null default true;
alter table historico_etapas add column concluido_em timestamptz;

-- So permite uma etapa AJUSTES aberta (nao concluida) por vez por paciente.
create unique index idx_historico_etapas_ajuste_aberta
  on historico_etapas (paciente_id)
  where etapa = 'AJUSTES' and not concluido;

drop table if exists solicitacoes_ajuste;
