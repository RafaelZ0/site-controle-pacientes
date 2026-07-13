import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { ETAPAS } from "../lib/constants";

const formInicial = { dentista_id: "", data: "", observacao: "" };

export default function HistoricoEtapas({ pacienteId, dentistas, dentistaPadrao }) {
  const [historico, setHistorico] = useState([]);
  const [error, setError] = useState(null);
  const [aberto, setAberto] = useState(null); // { etapa, entryId } | null
  const [form, setForm] = useState(formInicial);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const { data, error } = await supabase
      .from("historico_etapas")
      .select("*, dentistas(nome)")
      .eq("paciente_id", pacienteId)
      .order("created_at");
    if (error) setError(error.message);
    else setHistorico(data);
  }

  useEffect(() => {
    carregar();
  }, [pacienteId]);

  const etapaAtual = historico.length
    ? historico.reduce((last, e) =>
        new Date(e.created_at) > new Date(last.created_at) ? e : last
      ).etapa
    : null;

  function abrirNovoRegistro(etapa) {
    setForm({
      dentista_id: dentistaPadrao ?? "",
      data: todayISO(),
      observacao: "",
    });
    setAberto({ etapa, entryId: null });
  }

  function abrirEdicao(entry) {
    setForm({
      dentista_id: entry.dentista_id,
      data: entry.data,
      observacao: entry.observacao ?? "",
    });
    setAberto({ etapa: entry.etapa, entryId: entry.id });
  }

  function fechar() {
    setAberto(null);
    setForm(formInicial);
  }

  async function salvar(e) {
    e.preventDefault();
    setError(null);
    setSalvando(true);

    const payload = {
      paciente_id: pacienteId,
      etapa: aberto.etapa,
      dentista_id: form.dentista_id,
      data: form.data,
      observacao: form.observacao.trim() || null,
    };

    const result = aberto.entryId
      ? await supabase.from("historico_etapas").update(payload).eq("id", aberto.entryId)
      : await supabase.from("historico_etapas").insert(payload);

    setSalvando(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }
    fechar();
    carregar();
  }

  async function excluir(entryId) {
    setError(null);
    const { error } = await supabase.from("historico_etapas").delete().eq("id", entryId);
    if (error) setError(error.message);
    else carregar();
  }

  return (
    <div className="historico-etapas">
      <h3>Etapas do tratamento</h3>
      {error && <p className="error">{error}</p>}

      <div className="etapas-lista">
        {ETAPAS.map((etapa) => {
          const registros = historico.filter((h) => h.etapa === etapa);
          const temRegistro = registros.length > 0;
          const isAtual = etapa === etapaAtual;

          return (
            <div className="etapa-item" key={etapa}>
              <button
                type="button"
                className="etapa-item-header"
                onClick={() => abrirNovoRegistro(etapa)}
              >
                <span className={`etapa-marcador ${temRegistro ? "concluida" : ""}`}>
                  {temRegistro ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : null}
                </span>
                <span className="etapa-nome">{etapa}</span>
                {isAtual && <span className="badge badge-atual">atual</span>}
              </button>

              {registros.map((entry) => (
                <div className="etapa-registro" key={entry.id}>
                  <div>
                    <span className="etapa-registro-info">
                      {entry.dentistas?.nome ?? "—"} · {formatDate(entry.data)}
                    </span>
                    {entry.observacao && (
                      <p className="etapa-registro-obs">{entry.observacao}</p>
                    )}
                  </div>
                  <div className="etapa-registro-acoes">
                    <button type="button" className="btn-outline" onClick={() => abrirEdicao(entry)}>
                      Editar
                    </button>
                    <button type="button" className="btn-outline" onClick={() => excluir(entry.id)}>
                      Excluir
                    </button>
                  </div>
                </div>
              ))}

              {aberto?.etapa === etapa && (
                <form className="etapa-form" onSubmit={salvar}>
                  <label>
                    Dentista
                    <select
                      value={form.dentista_id}
                      onChange={(e) => setForm((f) => ({ ...f, dentista_id: e.target.value }))}
                      required
                    >
                      <option value="" disabled>
                        Selecione...
                      </option>
                      {dentistas.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Data
                    <input
                      type="date"
                      value={form.data}
                      onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    Observação (opcional)
                    <input
                      type="text"
                      value={form.observacao}
                      onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                    />
                  </label>

                  <div className="form-actions">
                    <button type="submit" disabled={salvando}>
                      {salvando ? "Salvando..." : "Salvar"}
                    </button>
                    <button type="button" className="btn-outline" onClick={fechar}>
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
