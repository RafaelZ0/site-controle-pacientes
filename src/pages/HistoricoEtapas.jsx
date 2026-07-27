import { useEffect, useState } from "react";
import { Check, Calendar } from "lucide-react";
import { supabase } from "../supabaseClient";
import { ETAPAS } from "../lib/constants";
import { useWorkspace } from "../lib/WorkspaceContext";

const formInicial = { dentista_id: "", data: "", observacao: "", consulta_id: "" };

export default function HistoricoEtapas({ pacienteId }) {
  const { workspace } = useWorkspace();
  const [historico, setHistorico] = useState([]);
  const [dentistas, setDentistas] = useState([]);
  const [dentistaPadrao, setDentistaPadrao] = useState("");
  const [consultas, setConsultas] = useState([]);
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
      .eq("workspace", workspace)
      .order("nome")
      .then(({ data }) => setDentistas(data ?? []));

    supabase
      .from("pacientes")
      .select("dentista_id, dentista_2_id")
      .eq("id", pacienteId)
      .single()
      .then(({ data }) => setDentistaPadrao(data?.dentista_id ?? data?.dentista_2_id ?? ""));

    supabase
      .from("consultas")
      .select("id, numero, data_prevista")
      .eq("paciente_id", pacienteId)
      .order("numero")
      .then(({ data }) => setConsultas(data ?? []));

    carregar();
  }, [pacienteId, workspace]);

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
    setForm({
      dentista_id: dentistaPadrao ?? "",
      data: todayISO(),
      observacao: "",
      consulta_id: "",
    });
    setEdicaoId(null);
    setMostrarForm(true);
  }

  function iniciarEdicao(entry) {
    setForm({
      dentista_id: entry.dentista_id,
      data: entry.data,
      observacao: entry.observacao ?? "",
      consulta_id: entry.consulta_id ?? "",
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
      consulta_id: form.consulta_id || null,
    };
    // AJUSTES é a única etapa que representa um trabalho pendente (não um
    // fato já ocorrido) — nasce não concluída. Só se aplica na criação;
    // editar um registro existente não deve mexer no status de conclusão.
    if (!edicaoId && modalEtapa === "AJUSTES") {
      payload.concluido = false;
    }

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
    const confirmado = window.confirm(
      "Excluir este registro de etapa? Essa ação não pode ser desfeita."
    );
    if (!confirmado) return;

    setError(null);
    const { error } = await supabase.from("historico_etapas").delete().eq("id", entryId);
    if (error) setError(error.message);
    else carregar();
  }

  const registrosModal = modalEtapa
    ? historico.filter((h) => h.etapa === modalEtapa)
    : [];

  const etapasRegistradas = new Set(historico.map((h) => h.etapa)).size;

  return (
    <div className="historico-etapas">
      <h3>Etapas do tratamento</h3>
      {error && <p className="error">{error}</p>}

      <div className="etapas-progresso">
        <div className="etapas-progresso-trilho">
          <div
            className="etapas-progresso-preenchido"
            style={{ width: `${(etapasRegistradas / ETAPAS.length) * 100}%` }}
          />
        </div>
        <span className="etapas-progresso-texto">
          {etapasRegistradas} de {ETAPAS.length} etapas registradas
        </span>
      </div>

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
              {temRegistro && <Check size={13} strokeWidth={3} />}
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
                            {entry.consulta_id &&
                              (() => {
                                const c = consultas.find((c) => c.id === entry.consulta_id);
                                return c ? ` · consulta #${c.numero}` : "";
                              })()}
                            {entry.etapa === "AJUSTES" && (
                              <span
                                className={`badge badge-inline ${
                                  entry.concluido ? "badge-adimplente" : "badge-neutro"
                                }`}
                              >
                                {entry.concluido
                                  ? `Concluído em ${formatDate(entry.concluido_em?.slice(0, 10))}`
                                  : "Pendente"}
                              </span>
                            )}
                          </span>
                          {entry.observacao && (
                            <p className="etapa-registro-obs">{entry.observacao}</p>
                          )}
                        </div>
                        <div className="etapa-registro-acoes">
                          <button type="button" className="btn-outline" onClick={() => iniciarEdicao(entry)}>
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn-danger-outline"
                            onClick={() => excluir(entry.id)}
                          >
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
                {dentistas.length === 0 ? (
                  <p className="error">
                    Nenhum dentista cadastrado neste workspace — cadastre um na
                    aba Dentistas antes de registrar esta etapa.
                  </p>
                ) : (
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
                )}

                <label>
                  <span className="label-texto">
                    <Calendar size={14} strokeWidth={1.75} />
                    Data
                  </span>
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

                <label>
                  Consulta relacionada (opcional)
                  <select
                    value={form.consulta_id}
                    onChange={(e) => setForm((f) => ({ ...f, consulta_id: e.target.value }))}
                  >
                    <option value="">Nenhuma</option>
                    {consultas.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.numero} — {formatDate(c.data_prevista)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="form-actions">
                  <button type="submit" disabled={salvando || dentistas.length === 0}>
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
