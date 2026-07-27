-- =========================================================
-- Fila de "ajustes" — pediram uma área separada pro Dr. Matheus
-- acompanhar pacientes enviados pra ajuste, independente da etapa de
-- tratamento (não é a mesma coisa que a etapa "AJUSTES" do histórico).
--
-- Sem restrição de acesso por usuário: Matheus continua vendo o
-- sistema inteiro como qualquer dentista, só ganha essa aba a mais.
-- Segue o mesmo modelo de confiança total das outras tabelas
-- (migration 0001).
-- =========================================================

create table solicitacoes_ajuste (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  criado_em timestamptz not null default now(),
  concluido boolean not null default false,
  concluido_em timestamptz
);

create index idx_solicitacoes_ajuste_paciente on solicitacoes_ajuste(paciente_id);

-- Evita duas solicitações abertas ao mesmo tempo pro mesmo paciente.
create unique index idx_solicitacoes_ajuste_aberta
  on solicitacoes_ajuste(paciente_id) where not concluido;

alter table solicitacoes_ajuste enable row level security;

create policy "authenticated_all_solicitacoes_ajuste" on solicitacoes_ajuste
  for all to authenticated using (true) with check (true);
