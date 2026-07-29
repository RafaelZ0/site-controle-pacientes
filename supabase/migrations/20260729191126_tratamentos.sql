-- =========================================================
-- Múltiplos tratamentos por paciente. Cada paciente pode ter N
-- tratamentos simultâneos (ex: implante + faceta ao mesmo tempo), cada
-- um com seu próprio serviço, financeiro (entrada + parcelas), plano de
-- consultas e progressão de etapas — em vez de um único plano fixo
-- direto em `pacientes`.
-- =========================================================

-- ---------------------------------------------------------
-- Serviços (gerenciável, mesmo padrão de `dentistas`)
-- ---------------------------------------------------------
create table servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  workspace text not null default 'clinica' check (workspace in ('clinica', 'curso')),
  ativo boolean not null default true,
  -- Mínimo/padrão de consultas desse serviço. 0 = ainda não definido
  -- (o usuário vai passar os valores reais por escrito depois) — usado
  -- como valor inicial de tratamentos.num_consultas ao escolher o serviço.
  num_consultas_padrao integer not null default 0 check (num_consultas_padrao >= 0),
  unique (nome, workspace)
);

alter table servicos enable row level security;

create policy "authenticated_all_servicos" on servicos
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------
-- Tratamentos: um por plano de tratamento de um paciente.
-- ---------------------------------------------------------
create table tratamentos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  servico_id uuid references servicos(id),
  data_inicio date not null,
  primeira_parcela_vencimento date,
  num_parcelas_entrada integer not null default 0 check (num_parcelas_entrada >= 0),
  num_parcelas integer not null default 0 check (num_parcelas >= 0),
  num_consultas integer not null default 0 check (num_consultas >= 0),
  created_at timestamptz not null default now()
);

create index idx_tratamentos_paciente on tratamentos(paciente_id);

alter table tratamentos enable row level security;

create policy "authenticated_all_tratamentos" on tratamentos
  for all to authenticated using (true) with check (true);

-- Nº de consultas nunca diminui (só aumenta) — garantido no banco, não só na UI.
create or replace function trg_tratamentos_guarda_num_consultas()
returns trigger
language plpgsql
as $$
begin
  if new.num_consultas < old.num_consultas then
    raise exception 'Número de consultas não pode diminuir (era %, tentou mudar para %)',
      old.num_consultas, new.num_consultas;
  end if;
  return new;
end;
$$;

create trigger before_update_tratamentos_guarda_consultas
  before update on tratamentos
  for each row
  execute function trg_tratamentos_guarda_num_consultas();

-- ---------------------------------------------------------
-- consultas / parcelas / historico_etapas passam a pendurar em
-- tratamento_id em vez de paciente_id.
-- ---------------------------------------------------------

-- consultas_status usa "c.*", e pacientes_status referencia paciente_id
-- de consultas/parcelas/historico_etapas nos laterais — as duas views
-- precisam cair antes de mexer nessas colunas, senão os drops abaixo
-- falham (view depende da coluna). consultas_status é recriada logo
-- depois; pacientes_status vira tratamentos_status lá no fim do arquivo.
drop view if exists consultas_status;
drop view if exists pacientes_status;

alter table consultas add column tratamento_id uuid references tratamentos(id) on delete cascade;
alter table consultas add column gap_implante boolean not null default false;

alter table parcelas add column tratamento_id uuid references tratamentos(id) on delete cascade;
alter table parcelas add column tipo text not null default 'tratamento' check (tipo in ('entrada', 'tratamento'));

alter table historico_etapas add column tratamento_id uuid references tratamentos(id) on delete cascade;

-- ---------------------------------------------------------
-- Migração dos dados existentes: cada paciente atual vira 1
-- tratamento com o plano que já tinha (servico em branco pra revisar
-- depois). Curso não tem paciente nenhum ainda, então isso só afeta a
-- Clínica na prática.
-- ---------------------------------------------------------
insert into tratamentos (id, paciente_id, servico_id, data_inicio, primeira_parcela_vencimento,
                          num_parcelas_entrada, num_parcelas, num_consultas)
select
  gen_random_uuid(),
  p.id,
  null,
  p.data_inicio,
  (select min(pc.data_vencimento) from parcelas pc where pc.paciente_id = p.id),
  0,
  p.num_parcelas,
  p.num_consultas
from pacientes p;

update consultas c
set tratamento_id = t.id
from tratamentos t
where t.paciente_id = c.paciente_id;

update parcelas pc
set tratamento_id = t.id, tipo = 'tratamento'
from tratamentos t
where t.paciente_id = pc.paciente_id;

update historico_etapas he
set tratamento_id = t.id
from tratamentos t
where t.paciente_id = he.paciente_id;

-- Agora que todo mundo tem tratamento_id, torna obrigatório e derruba as
-- colunas antigas de paciente_id (e os campos de plano em `pacientes`).
alter table consultas alter column tratamento_id set not null;
alter table parcelas alter column tratamento_id set not null;
alter table historico_etapas alter column tratamento_id set not null;

alter table consultas drop constraint if exists consultas_paciente_id_numero_key;
alter table consultas drop column paciente_id;
alter table consultas add constraint consultas_tratamento_id_numero_key unique (tratamento_id, numero);

create view consultas_status
with (security_invoker = true) as
select
  c.*,
  case
    when c.realizada then 'REALIZADA'
    when c.data_prevista < current_date then 'EM ATRASO'
    else 'EM DIA'
  end as status
from consultas c;

alter table parcelas drop constraint if exists parcelas_paciente_id_numero_key;
alter table parcelas drop column paciente_id;
alter table parcelas add constraint parcelas_tratamento_id_tipo_numero_key unique (tratamento_id, tipo, numero);

alter table historico_etapas drop column paciente_id;

alter table pacientes drop column data_inicio;
alter table pacientes drop column num_parcelas;
alter table pacientes drop column num_consultas;

-- ---------------------------------------------------------
-- Funções: parcelas (entrada + tratamento como sequência mensal única
-- a partir de primeira_parcela_vencimento)
-- ---------------------------------------------------------

-- Reset completo (usado só pelo botão explícito "apagar e recriar do
-- zero" — apaga tudo, inclusive pago/realizado).
create or replace function gerar_parcelas_tratamento(p_tratamento_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tratamento tratamentos%rowtype;
  i integer;
begin
  select * into v_tratamento from tratamentos where id = p_tratamento_id;
  if not found then
    raise exception 'Tratamento % não encontrado', p_tratamento_id;
  end if;

  delete from parcelas where tratamento_id = p_tratamento_id;

  if v_tratamento.primeira_parcela_vencimento is null then
    return;
  end if;

  for i in 1..v_tratamento.num_parcelas_entrada loop
    insert into parcelas (tratamento_id, tipo, numero, data_vencimento)
    values (
      p_tratamento_id, 'entrada', i,
      (v_tratamento.primeira_parcela_vencimento + ((i - 1) || ' months')::interval)::date
    );
  end loop;

  for i in 1..v_tratamento.num_parcelas loop
    insert into parcelas (tratamento_id, tipo, numero, data_vencimento)
    values (
      p_tratamento_id, 'tratamento', i,
      (v_tratamento.primeira_parcela_vencimento
        + ((v_tratamento.num_parcelas_entrada + i - 1) || ' months')::interval)::date
    );
  end loop;
end;
$$;

-- Recálculo inteligente: nunca sobrescreve paga=true, ancora as parcelas
-- em aberto na última paga (drift), preservando o formato original —
-- mesma lógica de sempre, agora numa sequência única entrada+tratamento.
create or replace function recalcular_parcelas_tratamento(p_tratamento_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tratamento tratamentos%rowtype;
  v_k_pos integer;
  v_anchor_data date;
  v_anchor_offset integer;
  v_drift integer;
  v_pos integer;
  i integer;
begin
  select * into v_tratamento from tratamentos where id = p_tratamento_id;
  if not found then
    raise exception 'Tratamento % não encontrado', p_tratamento_id;
  end if;

  if v_tratamento.primeira_parcela_vencimento is null then
    return;
  end if;

  select max(case when tipo = 'entrada' then numero else v_tratamento.num_parcelas_entrada + numero end)
    into v_k_pos
  from parcelas
  where tratamento_id = p_tratamento_id and paga = true;
  v_k_pos := coalesce(v_k_pos, 0);

  if v_k_pos = 0 then
    v_drift := 0;
  else
    select coalesce(data_pagamento, data_vencimento) into v_anchor_data
    from parcelas
    where tratamento_id = p_tratamento_id
      and (case when tipo = 'entrada' then numero else v_tratamento.num_parcelas_entrada + numero end) = v_k_pos;

    v_anchor_offset :=
      (extract(year from v_anchor_data)::int - extract(year from v_tratamento.primeira_parcela_vencimento)::int) * 12
      + (extract(month from v_anchor_data)::int - extract(month from v_tratamento.primeira_parcela_vencimento)::int);

    v_drift := v_anchor_offset - (v_k_pos - 1);
  end if;

  for i in 1..v_tratamento.num_parcelas_entrada loop
    v_pos := i;
    if not exists (
      select 1 from parcelas
      where tratamento_id = p_tratamento_id and tipo = 'entrada' and numero = i and paga = true
    ) then
      insert into parcelas (tratamento_id, tipo, numero, data_vencimento)
      values (
        p_tratamento_id, 'entrada', i,
        (v_tratamento.primeira_parcela_vencimento + ((v_pos - 1 + v_drift) || ' months')::interval)::date
      )
      on conflict (tratamento_id, tipo, numero) do update
        set data_vencimento = excluded.data_vencimento
        where parcelas.paga = false;
    end if;
  end loop;

  delete from parcelas
  where tratamento_id = p_tratamento_id and tipo = 'entrada'
    and numero > v_tratamento.num_parcelas_entrada and paga = false;

  for i in 1..v_tratamento.num_parcelas loop
    v_pos := v_tratamento.num_parcelas_entrada + i;
    if not exists (
      select 1 from parcelas
      where tratamento_id = p_tratamento_id and tipo = 'tratamento' and numero = i and paga = true
    ) then
      insert into parcelas (tratamento_id, tipo, numero, data_vencimento)
      values (
        p_tratamento_id, 'tratamento', i,
        (v_tratamento.primeira_parcela_vencimento + ((v_pos - 1 + v_drift) || ' months')::interval)::date
      )
      on conflict (tratamento_id, tipo, numero) do update
        set data_vencimento = excluded.data_vencimento
        where parcelas.paga = false;
    end if;
  end loop;

  delete from parcelas
  where tratamento_id = p_tratamento_id and tipo = 'tratamento'
    and numero > v_tratamento.num_parcelas and paga = false;
end;
$$;

-- ---------------------------------------------------------
-- Consultas: cadeia sequencial (sem fórmula/redistribuição). Cada
-- consulta pendente usa a data REAL (ou prevista, se ainda não
-- realizada) da consulta anterior + 1 mês — ou +6 meses se a consulta
-- anterior tiver a etapa IMPLANTE vinculada (historico_etapas.consulta_id).
-- Nunca sobrescreve realizada=true. Serve tanto pra gerar do zero quanto
-- pra recalcular incrementalmente (não existe distinção "gerar" aqui,
-- já que só cresce).
-- ---------------------------------------------------------
create or replace function recalcular_consultas_tratamento(p_tratamento_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tratamento tratamentos%rowtype;
  v_ancora_numero integer;
  v_ancora_data date;
  v_tem_implante boolean;
  v_intervalo interval;
  v_nova_data date;
  i integer;
begin
  select * into v_tratamento from tratamentos where id = p_tratamento_id;
  if not found then
    raise exception 'Tratamento % não encontrado', p_tratamento_id;
  end if;

  select numero, coalesce(data_realizada, data_prevista)
    into v_ancora_numero, v_ancora_data
  from consultas
  where tratamento_id = p_tratamento_id and realizada = true
  order by numero desc
  limit 1;

  if not found then
    v_ancora_numero := 0;
    v_ancora_data := v_tratamento.data_inicio;
  end if;

  for i in (v_ancora_numero + 1)..v_tratamento.num_consultas loop
    select exists (
      select 1
      from consultas c
      join historico_etapas he on he.consulta_id = c.id
      where c.tratamento_id = p_tratamento_id and c.numero = i - 1 and he.etapa = 'IMPLANTE'
    ) into v_tem_implante;

    v_intervalo := case when v_tem_implante then interval '6 months' else interval '1 month' end;

    if v_ancora_numero = 0 and i = 1 then
      v_nova_data := v_ancora_data;
    elsif i = v_ancora_numero + 1 then
      v_nova_data := v_ancora_data + v_intervalo;
    else
      v_nova_data := v_nova_data + v_intervalo;
    end if;

    insert into consultas (tratamento_id, numero, data_prevista, gap_implante)
    values (p_tratamento_id, i, v_nova_data, v_tem_implante)
    on conflict (tratamento_id, numero) do update
      set data_prevista = excluded.data_prevista, gap_implante = excluded.gap_implante
      where consultas.realizada = false;
  end loop;

  delete from consultas
  where tratamento_id = p_tratamento_id and numero > v_tratamento.num_consultas and realizada = false;
end;
$$;

-- Reset completo de consultas (par do gerar_parcelas_tratamento, pro
-- botão "apagar e recriar do zero").
create or replace function gerar_consultas_tratamento(p_tratamento_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from consultas where tratamento_id = p_tratamento_id;
  perform recalcular_consultas_tratamento(p_tratamento_id);
end;
$$;

-- ---------------------------------------------------------
-- Triggers: automatizam o recálculo de consultas (parcelas continuam
-- manuais/explícitas via RPC, como já era, por mexer com dinheiro).
-- ---------------------------------------------------------

-- Ao criar um tratamento já com num_consultas > 0 (ex: veio do padrão do
-- serviço), gera o plano de consultas.
create or replace function trg_tratamentos_gera_consultas()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.num_consultas > 0 then
    perform recalcular_consultas_tratamento(new.id);
  end if;
  return new;
end;
$$;

create trigger after_insert_tratamentos_gera_consultas
  after insert on tratamentos
  for each row
  execute function trg_tratamentos_gera_consultas();

-- Ao aumentar num_consultas, recalcula (só insere as novas, encadeando
-- a partir da última existente).
create or replace function trg_tratamentos_recalcula_consultas()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.num_consultas is distinct from old.num_consultas then
    perform recalcular_consultas_tratamento(new.id);
  end if;
  return new;
end;
$$;

create trigger after_update_tratamentos_recalcula_consultas
  after update on tratamentos
  for each row
  execute function trg_tratamentos_recalcula_consultas();

-- Ao marcar uma consulta como realizada, recalcula a cadeia a partir
-- dela (a próxima consulta passa a ancorar na data REAL, não na prevista).
create or replace function trg_consultas_realizada_recalcula()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform recalcular_consultas_tratamento(new.tratamento_id);
  return new;
end;
$$;

create trigger after_update_consultas_realizada
  after update on consultas
  for each row
  when (new.realizada = true and old.realizada = false)
  execute function trg_consultas_realizada_recalcula();

-- IMPLANTE → recalcula consultas do tratamento (o gap de 6 meses entra
-- sozinho, porque a consulta vinculada agora carrega a etapa IMPLANTE).
-- FINALIZADO → marca consultas em aberto do tratamento como realizadas.
create or replace function trg_historico_etapas_efeitos()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.etapa = 'IMPLANTE' then
    perform recalcular_consultas_tratamento(new.tratamento_id);
  elsif new.etapa = 'FINALIZADO' then
    update consultas
    set realizada = true,
        data_realizada = coalesce(data_realizada, new.data),
        observacao = coalesce(observacao, 'Concluída automaticamente (tratamento finalizado).')
    where tratamento_id = new.tratamento_id
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

-- Antigas funções por-paciente, superadas pelas de tratamento acima.
drop function if exists gerar_plano_paciente(uuid);
drop function if exists recalcular_plano_paciente(uuid);

-- ---------------------------------------------------------
-- View: tratamentos_status (substitui pacientes_status, já derrubada
-- acima — 1 linha por tratamento, não por paciente).
-- ---------------------------------------------------------
create view tratamentos_status
with (security_invoker = true) as
select
  t.*,
  p.nome_completo,
  p.telefone,
  p.cpf,
  p.dentista_id,
  p.dentista_2_id,
  p.workspace,
  s.nome as servico_nome,
  d.nome as dentista_nome,
  d2.nome as dentista_2_nome,
  etapa.etapa as etapa_atual,
  coalesce(cf.total, 0) as consultas_feitas,
  prox.data_prevista as proxima_consulta,
  (
    (select max(pc.data_vencimento) from parcelas pc where pc.tratamento_id = t.id)
    + case
        when exists (
          select 1 from historico_etapas he
          where he.tratamento_id = t.id and he.etapa = 'IMPLANTE'
        ) then interval '6 months'
        else interval '0'
      end
  )::date as data_fim_prevista,
  case
    when exists (
      select 1
      from parcelas pc
      where pc.tratamento_id = t.id
        and pc.paga = false
        and pc.data_vencimento < (current_date - interval '1 month')
    ) then 'INADIMPLENTE'
    else 'ADIMPLENTE'
  end as status_pagamento,
  exists (
    select 1 from consultas c
    where c.tratamento_id = t.id and c.realizada = false and c.data_prevista < current_date
  ) as tem_consulta_atrasada,
  (t.num_parcelas = 0 or t.num_consultas = 0) as configuracao_pendente
from tratamentos t
join pacientes p on p.id = t.paciente_id
left join servicos s on s.id = t.servico_id
left join dentistas d on d.id = p.dentista_id
left join dentistas d2 on d2.id = p.dentista_2_id
left join lateral (
  select count(*) as total
  from consultas c
  where c.tratamento_id = t.id and c.realizada = true
) cf on true
left join lateral (
  select c.data_prevista
  from consultas c
  where c.tratamento_id = t.id and c.realizada = false
  order by c.data_prevista asc
  limit 1
) prox on true
left join lateral (
  select he.etapa
  from historico_etapas he
  where he.tratamento_id = t.id
  order by he.created_at desc
  limit 1
) etapa on true;
