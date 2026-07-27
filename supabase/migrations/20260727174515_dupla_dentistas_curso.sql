-- =========================================================
-- Suporte a "dupla" de dentistas e cadastro sem dentista definido,
-- usado hoje só pela Gestão do Curso (pacientes ali podem ser
-- cadastrados antes de a dupla principal ser escalada). A Clínica
-- continua exigindo dentista_id no app (só o banco fica permissivo).
-- =========================================================

alter table pacientes alter column dentista_id drop not null;
alter table pacientes add column dentista_2_id uuid references dentistas(id);

-- Sem dentista ainda atribuído (ex.: paciente novo do Curso, dupla não
-- escalada) não pode impedir o registro da etapa inicial (AVALIAÇÃO).
alter table historico_etapas alter column dentista_id drop not null;

drop view if exists pacientes_status;

create view pacientes_status
with (security_invoker = true) as
select
  p.*,
  d.nome as dentista_nome,
  d2.nome as dentista_2_nome,
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
left join dentistas d on d.id = p.dentista_id
left join dentistas d2 on d2.id = p.dentista_2_id
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
