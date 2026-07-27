-- =========================================================
-- 1) Permite num_parcelas/num_consultas = 0 — usado quando o dentista
--    cadastra o paciente mas ainda não sabe quantas parcelas/consultas
--    o tratamento vai ter (decisão fica pra depois). gerar_plano_paciente
--    e recalcular_plano_paciente não precisam mudar: os loops
--    "for i in 1..0" do plpgsql simplesmente não executam quando o
--    total é 0 (a divisão por num_consultas-1 só roda dentro do loop).
--
-- 2) pacientes_status ganha duas colunas calculadas:
--    - tem_consulta_atrasada: pra filtrar "em atraso" com .eq() direto
--      na view (antes só dava pra calcular via consultas_status).
--    - configuracao_pendente: num_parcelas = 0 ou num_consultas = 0,
--      pra sinalizar na tela que falta terminar o cadastro do plano.
-- =========================================================

alter table pacientes drop constraint pacientes_num_parcelas_check;
alter table pacientes add constraint pacientes_num_parcelas_check check (num_parcelas >= 0);
alter table pacientes drop constraint pacientes_num_consultas_check;
alter table pacientes add constraint pacientes_num_consultas_check check (num_consultas >= 0);

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
