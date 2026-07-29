import { useMemo, useState } from "react";
import { paraCsv, baixarCsv } from "../lib/csv";

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatarMes(chave) {
  const [ano, mes] = chave.split("-");
  return `${NOMES_MES[Number(mes) - 1]} de ${ano}`;
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) return "";
  return formatDate(value.slice(0, 10));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExportarAjustesModal({ ajustes, dentistas, workspace, onClose }) {
  const [status, setStatus] = useState(""); // "" | "PENDENTES" | "CONCLUIDOS"
  const [dentistaId, setDentistaId] = useState("");
  const [mes, setMes] = useState("");
  const [error, setError] = useState(null);

  const colunasDisponiveis = useMemo(
    () => [
      {
        key: "nome_completo",
        label: "Nome",
        valor: (a) => a.tratamentos?.pacientes?.nome_completo,
      },
      {
        key: "servico_nome",
        label: "Serviço",
        valor: (a) => a.tratamentos?.servicos?.nome,
      },
      {
        key: "dentista_nome",
        label: workspace === "curso" ? "Dentista 1" : "Dentista",
        valor: (a) => a.dentistas?.nome,
      },
      ...(workspace === "curso"
        ? [{ key: "dentista_2_nome", label: "Dentista 2", valor: (a) => a.dentista2Nome }]
        : []),
      { key: "etapa_atual", label: "Etapa atual", valor: (a) => a.etapaAtual },
      { key: "data", label: "Enviado em", valor: (a) => formatDate(a.data) },
      {
        key: "status",
        label: "Status",
        valor: (a) => (a.concluido ? "Concluído" : "Pendente"),
      },
      {
        key: "concluido_em",
        label: "Concluído em",
        valor: (a) => (a.concluido ? formatDateTime(a.concluido_em) : ""),
      },
      { key: "observacao", label: "Observação", valor: (a) => a.observacao },
    ],
    [workspace]
  );

  const [colunas, setColunas] = useState(
    Object.fromEntries(colunasDisponiveis.map((c) => [c.key, true]))
  );

  const meses = useMemo(() => {
    const unicos = Array.from(new Set(ajustes.map((a) => a.data?.slice(0, 7)).filter(Boolean)));
    return unicos.sort((a, b) => b.localeCompare(a));
  }, [ajustes]);

  const filtrados = useMemo(() => {
    return ajustes.filter((a) => {
      if (status === "PENDENTES" && a.concluido) return false;
      if (status === "CONCLUIDOS" && !a.concluido) return false;
      if (dentistaId && a.dentista_id !== dentistaId) return false;
      if (mes && a.data?.slice(0, 7) !== mes) return false;
      return true;
    });
  }, [ajustes, status, dentistaId, mes]);

  function toggleColuna(key) {
    setColunas((c) => ({ ...c, [key]: !c[key] }));
  }

  function exportar() {
    const colunasEscolhidas = colunasDisponiveis.filter((c) => colunas[c.key]);
    if (colunasEscolhidas.length === 0) {
      setError("Selecione ao menos uma coluna pra exportar.");
      return;
    }
    setError(null);
    const csv = paraCsv(filtrados, colunasEscolhidas);
    baixarCsv(`ajustes_${todayISO()}.csv`, csv);
    onClose?.();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-largo" onClick={(e) => e.stopPropagation()}>
        <h2>Exportar CSV — Ajustes</h2>

        <div className="exportar-filtros">
          <label>
            Situação
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Enviados e concluídos</option>
              <option value="PENDENTES">Somente enviados</option>
              <option value="CONCLUIDOS">Somente concluídos</option>
            </select>
          </label>

          <label>
            Dentista que fez o ajuste
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
            Período (mês de envio)
            <select value={mes} onChange={(e) => setMes(e.target.value)}>
              <option value="">Todos</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {formatarMes(m)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="exportar-contagem">
          {filtrados.length} ajuste(s) correspondem a esses filtros
        </p>

        <div>
          <span className="label-texto">Colunas a exportar</span>
          <div className="etapas-checklist exportar-colunas">
            {colunasDisponiveis.map((c) => (
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
          <button type="button" onClick={exportar} disabled={filtrados.length === 0}>
            Exportar CSV
          </button>
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
