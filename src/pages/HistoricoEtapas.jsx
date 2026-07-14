import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { ETAPAS } from "../lib/constants";

const formInicial = { dentista_id: "", data: "", observacao: "" };

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function HistoricoEtapas({ pacienteId }) {
  const [historico, setHistorico] = useState([]);
  const [dentistas, setDentistas] = useState([]);
  const [dentistaPadrao, setDentistaPadrao] = useState("");
  const [error, setError] = useState(null);

  const [modalEtapa, setModalEtapa] = useState(null); // string | null
  const [mostrarForm, setMostrarForm] = useState(false);
  const [edicaoId, setEdicaoId] = useState(null);
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
    supabase
      .from("dentistas")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => setDentistas(data ?? []));

    supabase
      .from("pacientes")
      .select("dentista_id")
      .eq("id", pacienteId)
      .single()
      .then(({ data }) => setDentistaPadrao(data?.dentista_id ?? ""));

    carregar();
  }, [pacienteId]);

  const etapaAtual = historico.length
    ? historico.reduce((last, e) =>
        new Date(e.created_at) > new Date(last.created_at) ? e : last
      ).etapa
    : null;

  function abrirModal(etapa) {
    setModalEtapa(etapa);
    setMostrarForm(false);
    setEdicaoId(null);
  }

  function fecharModal() {
    setModalEtapa(null);
    setMostrarForm(false);
    setEdicaoId(null);
  }

  function iniciarNovoRegistro() {
    setForm({ dentista_id: dentistaPadrao ?? "", data: todayISO(), observacao: "" });
    setEdicaoId(null);
    setMostrarForm(true);
  }

  function iniciarEdicao(entry) {
    setForm({
      dentista_id: entry.dentista_id,
      data: entry.data,
      observacao: entry.observacao ?? "",
    });
    setEdicaoId(entry.id);
    setMostrarForm(true);
  }

  async function salvar(e) {
    e.preventDefault();
    setError(null);
    setSalvando(true);

    const payload = {
      paciente_id: pacienteId,
      etapa: modalEtapa,
      dentista_id: form.dentista_id,
      data: form.data,
      observacao: form.observacao.trim() || null,
    };

    const result = edicaoId
      ? await supabase.from("historico_etapas").update(payload).eq("id", edicaoId)
      : await supabase.from("historico_etapas").insert(payload);

    setSalvando(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }
    setMostrarForm(false);
    setEdicaoId(null);
    carregar();
  }

  async function excluir(entryId) {
    setError(null);
    const { error } = await supabase.from("historico_etapas").delete().eq("id", entryId);
    if (error) setError(error.message);
    else carregar();
  }

  const registrosModal = modalEtapa
    ? historico.filter((h) => h.etapa === modalEtapa)
    : [];

  return (
    <div className="historico-etapas">
      <h3>Etapas do tratamento</h3>
      {error && <p className="error">{error}</p>}

      <div className="etapas-chips">
        {ETAPAS.map((etapa) => {
          const registros = historico.filter((h) => h.etapa === etapa);
          const temRegistro = registros.length > 0;
          const isAtual = etapa === etapaAtual;
          const ultimo = temRegistro ? registros[registros.length - 1] : null;

          return (
            <button
              type="button"
              key={etapa}
              className={`etapa-chip ${temRegistro ? "concluida" : ""} ${isAtual ? "atual" : ""}`}
              onClick={() => abrirModal(etapa)}
            >
              {temRegistro && <CheckIcon />}
              <span className="etapa-chip-texto">
                <span className="etapa-chip-nome">{etapa}</span>
                {temRegistro && (
                  <span className="etapa-chip-info">
                    {ultimo.dentistas?.nome ?? "—"} · {formatDate(ultimo.data)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {modalEtapa && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>{modalEtapa}</h2>

            {!mostrarForm && (
              <>
                {registrosModal.length > 0 ? (
                  <div className="etapa-modal-lista">
                    {registrosModal.map((entry) => (
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
                          <button type="button" className="btn-outline" onClick={() => iniciarEdicao(entry)}>
                            Editar
                          </button>
                          <button type="button" className="btn-outline" onClick={() => excluir(entry.id)}>
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="modal-aviso">Nenhum registro ainda para esta etapa.</p>
                )}

                <div className="form-actions">
                  <button type="button" onClick={iniciarNovoRegistro}>
                    Novo registro
                  </button>
                  <button type="button" className="btn-outline" onClick={fecharModal}>
                    Fechar
                  </button>
                </div>
              </>
            )}

            {mostrarForm && (
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
                  <button type="button" className="btn-outline" onClick={() => setMostrarForm(false)}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
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
