create or replace view tratamentos_status as
 SELECT t.id,
    t.paciente_id,
    t.servico_id,
    t.data_inicio,
    t.primeira_parcela_vencimento,
    t.num_parcelas_entrada,
    t.num_parcelas,
    t.num_consultas,
    t.created_at,
    p.nome_completo,
    p.telefone,
    p.cpf,
    p.dentista_id,
    p.dentista_2_id,
    p.workspace,
    s.nome AS servico_nome,
    d.nome AS dentista_nome,
    d2.nome AS dentista_2_nome,
    etapa.etapa AS etapa_atual,
    COALESCE(cf.total, 0::bigint) AS consultas_feitas,
    prox.data_prevista AS proxima_consulta,
    ((( SELECT max(pc.data_vencimento) AS max
           FROM parcelas pc
          WHERE pc.tratamento_id = t.id)) +
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM historico_etapas he
              WHERE he.tratamento_id = t.id AND he.etapa = 'IMPLANTE'::text)) THEN '6 mons'::interval
            ELSE '00:00:00'::interval
        END)::date AS data_fim_prevista,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM parcelas pc
              WHERE pc.tratamento_id = t.id AND pc.paga = false AND pc.data_vencimento < (CURRENT_DATE - '1 mon'::interval) AND pc.renegociada = false)) THEN 'INADIMPLENTE'::text
            ELSE 'ADIMPLENTE'::text
        END AS status_pagamento,
    (EXISTS ( SELECT 1
           FROM consultas c
          WHERE c.tratamento_id = t.id AND c.realizada = false AND c.data_prevista < CURRENT_DATE)) AS tem_consulta_atrasada,
    t.num_parcelas = 0 OR t.num_consultas = 0 AS configuracao_pendente
   FROM tratamentos t
     JOIN pacientes p ON p.id = t.paciente_id
     LEFT JOIN servicos s ON s.id = t.servico_id
     LEFT JOIN dentistas d ON d.id = p.dentista_id
     LEFT JOIN dentistas d2 ON d2.id = p.dentista_2_id
     LEFT JOIN LATERAL ( SELECT count(*) AS total
           FROM consultas c
          WHERE c.tratamento_id = t.id AND c.realizada = true) cf ON true
     LEFT JOIN LATERAL ( SELECT c.data_prevista
           FROM consultas c
          WHERE c.tratamento_id = t.id AND c.realizada = false
          ORDER BY c.data_prevista
         LIMIT 1) prox ON true
     LEFT JOIN LATERAL ( SELECT he.etapa
           FROM historico_etapas he
          WHERE he.tratamento_id = t.id
          ORDER BY he.created_at DESC
         LIMIT 1) etapa ON true;
