-- =========================================================
-- Instituto Odontológico Dr. Pablo Santos — schema inicial
-- Substitui a planilha Excel (busca + 12 abas de dentistas)
-- =========================================================

create extension if not exists pgcrypto;

-- Dentistas
create table dentistas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true
);

-- Pacientes
-- Obs: NÃO existe coluna "consultas_feitas" — é sempre calculada a partir
-- de consultas.realizada = true (view pacientes_status), para nunca
-- dessincronizar do restante do sistema.
create table pacientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dentista_id uuid not null references dentistas(id),
  etapa_atual text not null check (etapa_atual in (
    'AVALIAÇÃO','EM TRATAMENTO','IMPLANTE','PROVISÓRIO','REABERTURA',
    'MOLDAGEM','PROVA','ENTREGA','AJUSTES','FINALIZADO'
  )),
  data_inicio date not null,
  num_parcelas integer not null check (num_parcelas > 0),
  num_consultas integer not null check (num_consultas > 0),
  consulta_implante_numero integer check (
    consulta_implante_numero is null
    or (consulta_implante_numero between 1 and num_consultas)
  ),
  created_at timestamptz not null default now()
);

-- Consultas previstas (substitui as 18 colunas fixas #1..#18 da planilha)
create table consultas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  numero integer not null check (numero > 0),
  data_prevista date not null,
  realizada boolean not null default false,
  data_realizada date,
  unique (paciente_id, numero)
);

-- Parcelas de pagamento (novo — não existia na planilha original)
create table parcelas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  numero integer not null check (numero > 0),
  data_vencimento date not null,
  paga boolean not null default false,
  data_pagamento date,
  unique (paciente_id, numero)
);

create index idx_pacientes_dentista on pacientes(dentista_id);
create index idx_pacientes_etapa on pacientes(etapa_atual);
create index idx_consultas_paciente on consultas(paciente_id);
create index idx_parcelas_paciente on parcelas(paciente_id);

-- RLS: dados de tratamento de pacientes são dados de saúde.
-- Só usuário autenticado (dentista logado) acessa; sem acesso anônimo.
-- Todos os dentistas autenticados enxergam todos os pacientes por enquanto
-- (igual à aba de busca da planilha, que cruzava todas as abas). Restringir
-- por dentista pode ser adicionado depois trocando "using (true)" por
-- "using (dentista_id = auth.uid())" ou equivalente, se for pedido.
alter table dentistas enable row level security;
alter table pacientes enable row level security;
alter table consultas enable row level security;
alter table parcelas enable row level security;

create policy "authenticated_read_dentistas" on dentistas
  for select to authenticated using (true);

create policy "authenticated_all_pacientes" on pacientes
  for all to authenticated using (true) with check (true);

create policy "authenticated_all_consultas" on consultas
  for all to authenticated using (true) with check (true);

create policy "authenticated_all_parcelas" on parcelas
  for all to authenticated using (true) with check (true);
