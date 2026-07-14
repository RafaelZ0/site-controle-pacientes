-- =========================================================
-- Troca o mecanismo do gap de 6 meses do implante: em vez de um campo
-- manual (pacientes.consulta_implante_numero, definido de antemão no
-- cadastro), o gap passa a disparar automaticamente quando a etapa
-- "IMPLANTE" é registrada em historico_etapas — que é quando o
-- implante de fato acontece na prática.
-- =========================================================

-- pacientes_status referencia a coluna diretamente; precisa cair antes.
drop view if exists pacientes_status;

alter table pacientes drop column if exists consulta_implante_numero;

-- ---------------------------------------------------------
-- gerar_plano_paciente: geração do zero (criação do paciente ou botão
-- "Apagar e recriar plano do zero"). Se o paciente já tem IMPLANTE no
-- histórico de etapas, o gap de 6 meses é aplicado a todas as
-- consultas já na primeira geração.
-- ---------------------------------------------------------
create or replace function gerar_plano_paciente(p_paciente_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_paciente pacientes%rowtype;
  v_tem_implante boolean;
  v_mes_offset integer;
  i integer;
begin
  select * into v_paciente from pacientes where id = p_paciente_id;
  if not found then
    raise exception 'Paciente % não encontrado', p_paciente_id;
  end if;

  select exists (
    select 1 from historico_etapas he
    where he.paciente_id = p_paciente_id and he.etapa = 'IMPLANTE'
  ) into v_tem_implante;

  delete from consultas where paciente_id = p_paciente_id;
  delete from parcelas where paciente_id = p_paciente_id;

  for i in 1..v_paciente.num_consultas loop
    if v_paciente.num_consultas = 1 then
      v_mes_offset := 0;
    else
      v_mes_offset := round(
        (i - 1)::numeric * (v_paciente.num_parcelas - 1) / (v_paciente.num_consultas - 1)
      );
    end if;

    if v_tem_implante then
      v_mes_offset := v_mes_offset + 6;
    end if;

    insert into consultas (paciente_id, numero, data_prevista)
    values (
      p_paciente_id,
      i,
      (v_paciente.data_inicio + (v_mes_offset || ' months')::interval)::date
    );
  end loop;

  for i in 1..v_paciente.num_parcelas loop
    insert into parcelas (paciente_id, numero, data_vencimento)
    values (
      p_paciente_id,
      i,
      (v_paciente.data_inicio + ((i - 1) || ' months')::interval)::date
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------
-- recalcular_plano_paciente: recálculo inteligente (edição de campos
-- críticos, ou disparado automaticamente ao registrar IMPLANTE).
--
-- O gap só entra no lado das consultas em ABERTO (i > âncora), nunca
-- no cálculo da âncora em si — se entrasse dos dois lados ele se
-- cancelaria matematicamente no drift (âncora reflete uma data real
-- que já aconteceu, sem gap nenhum; só o que ainda está por vir leva
-- o gap).
-- ---------------------------------------------------------
create or replace function recalcular_plano_paciente(p_paciente_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_paciente pacientes%rowtype;
  v_tem_implante boolean;
  v_k_consulta integer;
  v_k_parcela integer;
  v_anchor_consulta date;
  v_anchor_parcela date;
  v_anchor_offset integer;
  v_drift_consulta integer;
  v_drift_parcela integer;
  v_offset integer;
  i integer;
begin
  select * into v_paciente from pacientes where id = p_paciente_id;
  if not found then
    raise exception 'Paciente % não encontrado', p_paciente_id;
  end if;

  select exists (
    select 1 from historico_etapas he
    where he.paciente_id = p_paciente_id and he.etapa = 'IMPLANTE'
  ) into v_tem_implante;

  -- ===================== Consultas =====================
  select max(numero) into v_k_consulta
  from consultas
  where paciente_id = p_paciente_id and realizada = true;
  v_k_consulta := coalesce(v_k_consulta, 0);

  if v_k_consulta = 0 then
    v_drift_consulta := 0;
  else
    select coalesce(data_realizada, data_prevista) into v_anchor_consulta
    from consultas
    where paciente_id = p_paciente_id and numero = v_k_consulta;

    v_anchor_offset :=
      (extract(year from v_anchor_consulta)::int - extract(year from v_paciente.data_inicio)::int) * 12
      + (extract(month from v_anchor_consulta)::int - extract(month from v_paciente.data_inicio)::int);

    if v_paciente.num_consultas = 1 then
      v_offset := 0;
    else
      v_offset := round(
        (v_k_consulta - 1)::numeric * (v_paciente.num_parcelas - 1) / (v_paciente.num_consultas - 1)
      );
    end if;

    v_drift_consulta := v_anchor_offset - v_offset;
  end if;

  for i in 1..v_paciente.num_consultas loop
    if not exists (
      select 1 from consultas
      where paciente_id = p_paciente_id and numero = i and realizada = true
    ) then
      if v_paciente.num_consultas = 1 then
        v_offset := 0;
      else
        v_offset := round(
          (i - 1)::numeric * (v_paciente.num_parcelas - 1) / (v_paciente.num_consultas - 1)
        );
      end if;
      if v_tem_implante then
        v_offset := v_offset + 6;
      end if;

      insert into consultas (paciente_id, numero, data_prevista)
      values (
        p_paciente_id, i,
        (v_paciente.data_inicio + ((v_offset + v_drift_consulta) || ' months')::interval)::date
      )
      on conflict (paciente_id, numero) do update
        set data_prevista = excluded.data_prevista
        where consultas.realizada = false;
    end if;
  end loop;

  delete from consultas
  where paciente_id = p_paciente_id
    and numero > v_paciente.num_consultas
    and realizada = false;

  -- ===================== Parcelas (sem gap, como já era) =====================
  select max(numero) into v_k_parcela
  from parcelas
  where paciente_id = p_paciente_id and paga = true;
  v_k_parcela := coalesce(v_k_parcela, 0);

  if v_k_parcela = 0 then
    v_drift_parcela := 0;
  else
    select coalesce(data_pagamento, data_vencimento) into v_anchor_parcela
    from parcelas
    where paciente_id = p_paciente_id and numero = v_k_parcela;

    v_anchor_offset :=
      (extract(year from v_anchor_parcela)::int - extract(year from v_paciente.data_inicio)::int) * 12
      + (extract(month from v_anchor_parcela)::int - extract(month from v_paciente.data_inicio)::int);

    v_drift_parcela := v_anchor_offset - (v_k_parcela - 1);
  end if;

  for i in 1..v_paciente.num_parcelas loop
    if not exists (
      select 1 from parcelas
      where paciente_id = p_paciente_id and numero = i and paga = true
    ) then
      insert into parcelas (paciente_id, numero, data_vencimento)
      values (
        p_paciente_id, i,
        (v_paciente.data_inicio + ((i - 1 + v_drift_parcela) || ' months')::interval)::date
      )
      on conflict (paciente_id, numero) do update
        set data_vencimento = excluded.data_vencimento
        where parcelas.paga = false;
    end if;
  end loop;

  delete from parcelas
  where paciente_id = p_paciente_id
    and numero > v_paciente.num_parcelas
    and paga = false;
end;
$$;

-- ---------------------------------------------------------
-- Gatilho: ao registrar a etapa IMPLANTE, recalcula automaticamente
-- as consultas/parcelas em aberto (aplicando o gap). Roda no banco,
-- não no front-end — dispara não importa por onde o registro entrar.
-- ---------------------------------------------------------
create or replace function trg_historico_implante()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.etapa = 'IMPLANTE' then
    perform recalcular_plano_paciente(new.paciente_id);
  end if;
  return new;
end;
$$;

drop trigger if exists after_insert_historico_implante on historico_etapas;

create trigger after_insert_historico_implante
  after insert on historico_etapas
  for each row
  execute function trg_historico_implante();

-- ---------------------------------------------------------
-- pacientes_status: "data de finalização" agora soma os 6 meses com
-- base em existir IMPLANTE no histórico, não mais na coluna removida.
-- ---------------------------------------------------------
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
