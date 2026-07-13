-- =========================================================
-- Histórico de etapas: substitui o campo fixo pacientes.etapa_atual
-- =========================================================

create table historico_etapas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid references pacientes(id) on delete cascade,
  etapa text not null check (etapa in (
    'AVALIAÇÃO','EM TRATAMENTO','IMPLANTE','PROVISÓRIO','REABERTURA',
    'MOLDAGEM','PROVA','ENTREGA','AJUSTES','FINALIZADO'
  )),
  dentista_id uuid references dentistas(id) not null,
  data date not null default current_date,
  observacao text,
  created_at timestamptz default now()
);
-- Sem unique(paciente_id, etapa) de propósito: a mesma etapa pode se
-- repetir ao longo do tratamento (ex: REABERTURA não é um evento único).

create index idx_historico_etapas_paciente on historico_etapas(paciente_id);

alter table historico_etapas enable row level security;

create policy "authenticated_all_historico_etapas" on historico_etapas
  for all to authenticated using (true) with check (true);

-- Backfill: cria um registro inicial por paciente já cadastrado, usando a
-- etapa e o dentista responsável atuais, antes de remover a coluna fixa.
insert into historico_etapas (paciente_id, etapa, dentista_id, data, created_at)
select id, etapa_atual, dentista_id, created_at::date, created_at
from pacientes;

-- pacientes_status depende de etapa_atual; precisa cair antes da coluna
-- (a 0007 recria a view já sem depender dessa coluna).
drop view if exists pacientes_status;

alter table pacientes drop column etapa_atual;
