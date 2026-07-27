-- =========================================================
-- Corrige "column pacientes_status.workspace does not exist".
--
-- Views que fazem "select p.*" no Postgres congelam a lista de colunas
-- no momento da criação/último CREATE OR REPLACE — adicionar uma
-- coluna na tabela depois (migration 0017) não propaga sozinho pra
-- view. E como "workspace" entra no meio do p.* (antes de
-- dentista_nome), nem dava pra usar CREATE OR REPLACE VIEW direto
-- (Postgres só permite acrescentar colunas no final, não deslocar as
-- do meio) — por isso precisa dropar e recriar.
-- =========================================================

drop view if exists pacientes_status;

create view pacientes_status
with (security_invoker = true) as
select
  p.*,
  d.nome as dentista_nome,
  etapa.etapa as etapa_atual,
  coalesce(cf.total, 0) as consultas_feitas,
  prox.data_prevista as proxima_consulta,
  (
    (select max(pc.data_vencimento) from parcelas pc where pc.paciente_id = p.id)
    + case
        when exists (
          select 1 from historico_etapas he
          where he.paciente_id = p.id and he.etapa = 'IMPLANTE'
        ) then interval '6 months'
        else interval '0'
      end
  )::date as data_fim_prevista,
  case
    when exists (
      select 1
      from parcelas pc
      where pc.paciente_id = p.id
        and pc.paga = false
        and pc.data_vencimento < (current_date - interval '1 month')
    ) then 'INADIMPLENTE'
    else 'ADIMPLENTE'
  end as status_pagamento,
  exists (
    select 1 from consultas c
    where c.paciente_id = p.id and c.realizada = false and c.data_prevista < current_date
  ) as tem_consulta_atrasada,
  (p.num_parcelas = 0 or p.num_consultas = 0) as configuracao_pendente
from pacientes p
join dentistas d on d.id = p.dentista_id
left join lateral (
  select count(*) as total
  from consultas c
  where c.paciente_id = p.id and c.realizada = true
) cf on true
left join lateral (
  select c.data_prevista
  from consultas c
  where c.paciente_id = p.id and c.realizada = false
  order by c.data_prevista asc
  limit 1
) prox on true
left join lateral (
  select he.etapa
  from historico_etapas he
  where he.paciente_id = p.id
  order by he.created_at desc
  limit 1
) etapa on true;
