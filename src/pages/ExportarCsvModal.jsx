import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { ETAPAS } from "../lib/constants";
import { useWorkspace } from "../lib/WorkspaceContext";
import { paraCsv, baixarCsv } from "../lib/csv";

const COLUNAS_DISPONIVEIS = [
  { key: "nome_completo", label: "Nome", valor: (p) => p.nome_completo },
  { key: "telefone", label: "Telefone", valor: (p) => p.telefone },
  { key: "cpf", label: "CPF", valor: (p) => p.cpf },
  { key: "dentista_nome", label: "Dentista", valor: (p) => p.dentista_nome },
  { key: "dentista_2_nome", label: "Dentista 2", valor: (p) => p.dentista_2_nome },
  { key: "etapa_atual", label: "Etapa", valor: (p) => p.etapa_atual },
  { key: "data_inicio", label: "Início", valor: (p) => formatDate(p.data_inicio) },
  {
    key: "data_fim_prevista",
    label: "Fim previsto",
    valor: (p) => formatDate(p.data_fim_prevista),
  },
  {
    key: "proxima_consulta",
    label: "Próxima consulta",
    valor: (p) => formatDate(p.proxima_consulta),
  },
  { key: "status_pagamento", label: "Status pagamento", valor: (p) => p.status_pagamento },
  { key: "num_parcelas", label: "Nº parcelas", valor: (p) => p.num_parcelas },
  { key: "num_consultas", label: "Nº consultas", valor: (p) => p.num_consultas },
  { key: "consultas_feitas", label: "Consultas feitas", valor: (p) => p.consultas_feitas },
  {
    key: "configuracao_pendente",
    label: "Configuração pendente",
    valor: (p) => (p.configuracao_pendente ? "Sim" : "Não"),
  },
];

const COLUNAS_PADRAO = Object.fromEntries(COLUNAS_DISPONIVEIS.map((c) => [c.key, true]));

export default function ExportarCsvModal({ dentistas, onClose }) {
  const { workspace } = useWorkspace();
  const [situacao, setSituacao] = useState("");
  const [dentistaId, setDentistaId] = useState("");
  const [etapa, setEtapa] = useState("");
  const [ano, setAno] = useState("");
  const [anos, setAnos] = useState([]);
  const [colunas, setColunas] = useState(COLUNAS_PADRAO);
  const [contagem, setContagem] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from("pacientes")
      .select("data_inicio")
      .eq("workspace", workspace)
      .then(({ data }) => {
        const anosUnicos = Array.from(
          new Set((data ?? []).map((p) => p.data_inicio?.slice(0, 4)).filter(Boolean))
        ).sort((a, b) => b.localeCompare(a));
        setAnos(anosUnicos);
      });
  }, [workspace]);

  useEffect(() => {
    let cancelado = false;
    aplicarFiltros(supabase.from("pacientes_status").select("id", { count: "exact", head: true }))
      .then(({ count, error }) => {
        if (cancelado) return;
        if (error) {
          setError(error.message);
          setContagem(null);
          return;
        }
        setContagem(count ?? 0);
      });
    return () => {
      cancelado = true;
    };
  }, [workspace, situacao, dentistaId, etapa, ano]);

  function aplicarFiltros(query) {
    let q = query.eq("workspace", workspace);
    if (dentistaId) {
      q = q.or(`dentista_id.eq.${dentistaId},dentista_2_id.eq.${dentistaId}`);
    }
    if (etapa) q = q.eq("etapa_atual", etapa);
    if (situacao === "EM_ATRASO") q = q.eq("tem_consulta_atrasada", true);
    else if (situacao === "INADIMPLENTE") q = q.eq("status_pagamento", "INADIMPLENTE");
    else if (situacao === "CONFIG_PENDENTE") q = q.eq("configuracao_pendente", true);
    if (ano) q = q.gte("data_inicio", `${ano}-01-01`).lte("data_inicio", `${ano}-12-31`);
    return q;
  }

  function toggleColuna(key) {
    setColunas((c) => ({ ...c, [key]: !c[key] }));
  }

  async function exportar() {
    const colunasEscolhidas = COLUNAS_DISPONIVEIS.filter((c) => colunas[c.key]);
    if (colunasEscolhidas.length === 0) {
      setError("Selecione ao menos uma coluna pra exportar.");
      return;
    }

    setError(null);
    setExportando(true);

    const { data, error } = await aplicarFiltros(
      supabase.from("pacientes_status").select("*")
    ).order("nome_completo");

    setExportando(false);

    if (error) {
      setError(error.message);
      return;
    }

    const csv = paraCsv(data ?? [], colunasEscolhidas);
    baixarCsv(`pacientes_${todayISO()}.csv`, csv);
    onClose?.();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-largo" onClick={(e) => e.stopPropagation()}>
        <h2>Exportar CSV</h2>

        <div className="exportar-filtros">
          <label>
            Situação
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="">Todos</option>
              <option value="EM_ATRASO">Em atraso</option>
              <option value="INADIMPLENTE">Inadimplente</option>
              <option value="CONFIG_PENDENTE">Configuração pendente</option>
            </select>
          </label>

          <label>
            Dentista
            <select value={dentistaId} onChange={(e) => setDentistaId(e.target.value)}>
              <option value="">Todos</option>
              {dentistas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </label>

          <label>
            Etapa
            <select value={etapa} onChange={(e) => setEtapa(e.target.value)}>
              <option value="">Todas</option>
              {ETAPAS.map((et) => (
                <option key={et} value={et}>
                  {et}
                </option>
              ))}
            </select>
          </label>

          <label>
            Ano de início
            <select value={ano} onChange={(e) => setAno(e.target.value)}>
              <option value="">Todos</option>
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="exportar-contagem">
          {contagem === null ? "Contando..." : `${contagem} pacientes correspondem a esses filtros`}
        </p>

        <div>
          <span className="label-texto">Colunas a exportar</span>
          <div className="etapas-checklist exportar-colunas">
            {COLUNAS_DISPONIVEIS.map((c) => (
              <label key={c.key} className="checkbox-linha">
                <input
                  type="checkbox"
                  checked={Boolean(colunas[c.key])}
                  onChange={() => toggleColuna(c.key)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button type="submit" onClick={exportar} disabled={exportando || contagem === 0}>
            {exportando ? "Exportando..." : "Exportar CSV"}
          </button>
          <button type="button" className="btn-outline" onClick={onClose} disabled={exportando}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
