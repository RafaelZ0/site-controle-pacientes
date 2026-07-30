-- =========================================================
-- Entrada ganha data de vencimento própria (independente da 1ª parcela
-- do tratamento) e pode ser à vista ou parcelada.
--
-- Além disso, o recálculo de parcelas passa a ajustar a data de TODAS
-- as parcelas — inclusive as já marcadas como pagas. Antes ele
-- preservava as pagas (âncora + drift); a pedido do usuário, mudar o
-- parcelamento agora reescreve a régua inteira, mantendo só o status
-- pago/data de pagamento de cada linha que continua existindo.
-- =========================================================

alter table tratamentos add column entrada_vencimento date;
alter table tratamentos add column entrada_modalidade text not null default 'parcelado'
  check (entrada_modalidade in ('avista', 'parcelado'));

-- Quem já tinha entrada configurada usava a mesma data da 1ª parcela
-- do tratamento (não havia campo separado) — preserva esse valor.
update tratamentos
set entrada_vencimento = primeira_parcela_vencimento
where num_parcelas_entrada > 0;

update tratamentos
set entrada_modalidade = case when num_parcelas_entrada = 1 then 'avista' else 'parcelado' end;

-- ---------------------------------------------------------
-- Geração do zero (botão "apagar e recriar"): entrada ancorada em
-- entrada_vencimento, tratamento em primeira_parcela_vencimento —
-- duas réguas mensais independentes.
-- ---------------------------------------------------------
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

  if v_tratamento.entrada_vencimento is not null then
    for i in 1..(case when v_tratamento.entrada_modalidade = 'avista' then 1 else v_tratamento.num_parcelas_entrada end) loop
      insert into parcelas (tratamento_id, tipo, numero, data_vencimento)
      values (
        p_tratamento_id, 'entrada', i,
        (v_tratamento.entrada_vencimento + ((i - 1) || ' months')::interval)::date
      );
    end loop;
  end if;

  if v_tratamento.primeira_parcela_vencimento is not null then
    for i in 1..v_tratamento.num_parcelas loop
      insert into parcelas (tratamento_id, tipo, numero, data_vencimento)
      values (
        p_tratamento_id, 'tratamento', i,
        (v_tratamento.primeira_parcela_vencimento + ((i - 1) || ' months')::interval)::date
      );
    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------
-- Recálculo: reescreve a data de todas as parcelas (pagas inclusive),
-- acrescenta as que faltam e remove as que sobraram além do novo
-- total. O status paga/data_pagamento de cada linha que permanece não
-- é tocado — só o vencimento.
-- ---------------------------------------------------------
create or replace function recalcular_parcelas_tratamento(p_tratamento_id uuid)
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

  if v_tratamento.entrada_vencimento is null then
    delete from parcelas where tratamento_id = p_tratamento_id and tipo = 'entrada';
  else
    for i in 1..(case when v_tratamento.entrada_modalidade = 'avista' then 1 else v_tratamento.num_parcelas_entrada end) loop
      insert into parcelas (tratamento_id, tipo, numero, data_vencimento)
      values (
        p_tratamento_id, 'entrada', i,
        (v_tratamento.entrada_vencimento + ((i - 1) || ' months')::interval)::date
      )
      on conflict (tratamento_id, tipo, numero) do update
        set data_vencimento = excluded.data_vencimento;
    end loop;

    delete from parcelas
    where tratamento_id = p_tratamento_id and tipo = 'entrada'
      and numero > (case when v_tratamento.entrada_modalidade = 'avista' then 1 else v_tratamento.num_parcelas_entrada end);
  end if;

  if v_tratamento.primeira_parcela_vencimento is null then
    delete from parcelas where tratamento_id = p_tratamento_id and tipo = 'tratamento';
  else
    for i in 1..v_tratamento.num_parcelas loop
      insert into parcelas (tratamento_id, tipo, numero, data_vencimento)
      values (
        p_tratamento_id, 'tratamento', i,
        (v_tratamento.primeira_parcela_vencimento + ((i - 1) || ' months')::interval)::date
      )
      on conflict (tratamento_id, tipo, numero) do update
        set data_vencimento = excluded.data_vencimento;
    end loop;

    delete from parcelas
    where tratamento_id = p_tratamento_id and tipo = 'tratamento'
      and numero > v_tratamento.num_parcelas;
  end if;
end;
$$;
