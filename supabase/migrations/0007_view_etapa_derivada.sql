-- =========================================================
-- pacientes_status: etapa_atual agora é derivada de historico_etapas
-- (o registro mais recente por created_at), não mais uma coluna fixa.
-- =========================================================

create or replace view pacientes_status
with (security_invoker = true) as
select
  p.*,
  d.nome as dentista_nome,
  etapa.etapa as etapa_atual,
  coalesce(cf.total, 0) as consultas_feitas,
  prox.data_prevista as proxima_consulta,
  (
    (select max(pc.data_vencimento) from parcelas pc where pc.paciente_id = p.id)
    + case when p.consulta_implante_numero is not null then interval '6 months'
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
  end as status_pagamento
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
