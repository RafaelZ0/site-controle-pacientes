-- =========================================================
-- Status automáticos (item 4 do brief) — calculados, nunca gravados.
-- =========================================================

-- Status de cada consulta: REALIZADA / EM ATRASO / EM DIA
-- security_invoker = true: a view roda com as permissões de quem consulta
-- (não do dono da view), senão ela ignora as políticas de RLS das tabelas
-- por baixo — gotcha comum no Supabase, onde o dono das views tem BYPASSRLS.
create or replace view consultas_status
with (security_invoker = true) as
select
  c.*,
  case
    when c.realizada then 'REALIZADA'
    when c.data_prevista < current_date then 'EM ATRASO'
    else 'EM DIA'
  end as status
from consultas c;

-- Visão consolidada de paciente para a tela de busca: etapa, dentista,
-- consultas feitas (calculado), próxima consulta, previsão de término
-- e status de adimplência (ADIMPLENTE / INADIMPLENTE).
--
-- Regra de inadimplência confirmada com o Pablo: um mês de atraso numa
-- parcela não paga já classifica o paciente como inadimplente.
create or replace view pacientes_status
with (security_invoker = true) as
select
  p.*,
  d.nome as dentista_nome,
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
) prox on true;
