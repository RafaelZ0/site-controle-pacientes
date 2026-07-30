import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { ETAPAS } from "../lib/constants";

const STATUS_LABEL = {
  "EM ATRASO": "em atraso",
  "EM DIA": "em dia",
  REALIZADA: "realizada",
};

const LIMITE_PADRAO = 4;
const PRIORIDADE_CONSULTA = { "EM ATRASO": 0, "EM DIA": 1, REALIZADA: 2 };

export default function ConsultasParcelas({ tratamentoId }) {
  const [consultas, setConsultas] = useState([]);
  const [numConsultas, setNumConsultas] = useState(0);
  const [salvandoNumConsultas, setSalvandoNumConsultas] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [verTodasConsultas, setVerTodasConsultas] = useState(false);

  const [dentistaPadrao, setDentistaPadrao] = useState("");

  const [modalRealizar, setModalRealizar] = useState(null); // consulta | null
  const [formRealizar, setFormRealizar] = useState({ data: "", observacao: "", etapas: [] });
  const [etapasJaFeitas, setEtapasJaFeitas] = useState(new Set());
  const [salvandoRealizar, setSalvandoRealizar] = useState(false);

  const [modalDetalhe, setModalDetalhe] = useState(null); // consulta | null
  const [etapasDaConsulta, setEtapasDaConsulta] = useState([]);

  async function carregar() {
    const [c, t] = await Promise.all([
      supabase
        .from("consultas_status")
        .select("*")
        .eq("tratamento_id", tratamentoId)
        .order("numero"),
      supabase
        .from("tratamentos")
        .select("num_consultas")
        .eq("id", tratamentoId)
        .single(),
    ]);
    if (c.error) setError(c.error.message);
    else setConsultas(c.data);
    if (t.error) setError(t.error.message);
    else {
      setNumConsultas(t.data.num_consultas);
    }
  }

  useEffect(() => {
    carregar();
    supabase
      .from("tratamentos")
      .select("pacientes(dentista_id, dentista_2_id)")
      .eq("id", tratamentoId)
      .single()
      .then(({ data }) =>
        setDentistaPadrao(data?.pacientes?.dentista_id ?? data?.pacientes?.dentista_2_id ?? "")
      );
  }, [tratamentoId]);

  async function adicionarConsulta() {
    setError(null);
    setInfo(null);

    const novo = numConsultas + 1;
    if (novo < numConsultas) {
      setError("O nº de consultas não pode diminuir — só aumentar.");
      return;
    }

    setSalvandoNumConsultas(true);
    const { error } = await supabase
      .from("tratamentos")
      .update({ num_consultas: novo })
      .eq("id", tratamentoId);
    setSalvandoNumConsultas(false);

    if (error) {
      setError(error.message);
      return;
    }
    carregar();
  }

  async function handleRegenerarConsultas() {
    const consultasFeitas = consultas.filter((c) => c.realizada).length;
    const confirmado = window.confirm(
      `Isso vai apagar TODAS as consultas deste tratamento e recriar do zero — inclusive ${consultasFeitas} já realizada(s), que serão perdidas. Essa ação não pode ser desfeita. Continuar?`
    );
    if (!confirmado) return;

    setError(null);
    setInfo(null);
    setRegenerando(true);
    const { error } = await supabase.rpc("gerar_consultas_tratamento", {
      p_tratamento_id: tratamentoId,
    });
    setRegenerando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInfo("Consultas regeneradas do zero a partir do nº atual.");
    carregar();
  }

  async function abrirMarcarRealizada(consulta) {
    setError(null);
    setFormRealizar({ data: todayISO(), observacao: "", etapas: [] });
    setModalRealizar(consulta);

    const { data } = await supabase
      .from("historico_etapas")
      .select("etapa")
      .eq("tratamento_id", tratamentoId);
    setEtapasJaFeitas(new Set((data ?? []).map((e) => e.etapa)));
  }

  function toggleEtapaSelecionada(etapa) {
    setFormRealizar((f) => ({
      ...f,
      etapas: f.etapas.includes(etapa)
        ? f.etapas.filter((e) => e !== etapa)
        : [...f.etapas, etapa],
    }));
  }

  async function confirmarRealizada(e) {
    e.preventDefault();
    setSalvandoRealizar(true);

    const { error } = await supabase
      .from("consultas")
      .update({
        realizada: true,
        data_realizada: formRealizar.data,
        observacao: formRealizar.observacao.trim(),
      })
      .eq("id", modalRealizar.id);

    if (error) {
      setSalvandoRealizar(false);
      setError(error.message);
      return;
    }

    if (formRealizar.etapas.length > 0) {
      const registros = formRealizar.etapas.map((etapa) => ({
        tratamento_id: tratamentoId,
        etapa,
        dentista_id: dentistaPadrao,
        data: formRealizar.data,
        consulta_id: modalRealizar.id,
      }));
      const { error: etapasError } = await supabase.from("historico_etapas").insert(registros);
      if (etapasError) {
        // A consulta já foi salva como realizada acima; só as etapas
        // falharam. Atualiza a lista pra tela não ficar desincronizada
        // do banco, e deixa claro que só uma parte não foi salva.
        setSalvandoRealizar(false);
        setError(
          `Consulta marcada como realizada, mas as etapas selecionadas não foram salvas: ${etapasError.message}`
        );
        setModalRealizar(null);
        carregar();
        return;
      }
    }

    setSalvandoRealizar(false);
    setModalRealizar(null);
    carregar();
  }

  async function desmarcarRealizada(consulta) {
    setError(null);
    const { error } = await supabase
      .from("consultas")
      .update({ realizada: false, data_realizada: null, observacao: null })
      .eq("id", consulta.id);
    if (error) setError(error.message);
    else carregar();
  }

  async function abrirDetalhe(consulta) {
    setModalDetalhe(consulta);
    const { data, error } = await supabase
      .from("historico_etapas")
      .select("*, dentistas(nome)")
      .eq("consulta_id", consulta.id)
      .order("created_at");
    if (error) setError(error.message);
    else setEtapasDaConsulta(data ?? []);
  }

  function fecharDetalhe() {
    setModalDetalhe(null);
    setEtapasDaConsulta([]);
  }

  const consultasOrdenadas = [...consultas].sort(
    (a, b) =>
      (PRIORIDADE_CONSULTA[a.status] ?? 1) - (PRIORIDADE_CONSULTA[b.status] ?? 1) ||
      a.numero - b.numero
  );
  const consultasVisiveis = verTodasConsultas
    ? consultasOrdenadas
    : consultasOrdenadas.slice(0, LIMITE_PADRAO);

  return (
    <div className="consultas-parcelas">
      <h3>Consultas</h3>

      {error && <p className="error">{error}</p>}
      {info && <p className="info">{info}</p>}

      <form className="num-consultas-form" onSubmit={adicionarConsulta}>
        <label>
          Consultas planejadas pelo serviço: {numConsultas}
          <input
            type="hidden"
            min={numConsultas}
            value={numConsultas}
            readOnly
          />
          <span className="label-ajuda">
            A quantidade inicial é definida pelo serviço. A consulta extra é
            calculada a partir da última data (real, quando houver).
          </span>
        </label>
        <button type="submit" disabled={salvandoNumConsultas}>
          {salvandoNumConsultas ? "Adicionando..." : "+ Adicionar consulta"}
        </button>
      </form>

      <table className="cp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Data prevista</th>
            <th>Status</th>
            <th>Realizada</th>
          </tr>
        </thead>
        <tbody>
          {consultasVisiveis.map((c) => (
            <tr key={c.id} className="cp-row-clicavel" onClick={() => abrirDetalhe(c)}>
              <td>{c.numero}</td>
              <td>{formatDate(c.data_prevista)}</td>
              <td>
                <span className={`badge badge-consulta-${c.status.toLowerCase().replace(" ", "-")}`}>
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
                {c.gap_implante && (
                  <span className="badge badge-inline badge-neutro" title="Consulta 6 meses após o implante">
                    +6 meses
                  </span>
                )}
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <label className="check-touch">
                  <input
                    type="checkbox"
                    checked={c.realizada}
                    onChange={() =>
                      c.realizada ? desmarcarRealizada(c) : abrirMarcarRealizada(c)
                    }
                  />
                </label>
              </td>
            </tr>
          ))}
          {consultas.length === 0 && (
            <tr>
              <td colSpan={4} className="estado-vazio">
                <div className="estado-vazio-conteudo">
                  <span>Nenhuma consulta ainda — defina o nº de consultas acima.</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {consultas.length > LIMITE_PADRAO && (
        <button
          type="button"
          className="btn-outline ver-todas"
          onClick={() => setVerTodasConsultas((v) => !v)}
        >
          {verTodasConsultas ? "Mostrar menos" : `Ver todas as ${consultas.length}`}
        </button>
      )}

      {consultas.length > 0 && (
        <div className="regenerar-plano">
          <p>
            Aumentar o nº de consultas acima já recalcula sozinho, sem mexer
            no que já foi realizado. Se em vez disso você quiser{" "}
            <strong>apagar e recriar as consultas do zero</strong> (perde
            marcações de realizada), use o botão abaixo.
          </p>
          <button
            type="button"
            className="btn-danger-outline"
            onClick={handleRegenerarConsultas}
            disabled={regenerando}
          >
            {regenerando ? "Regenerando..." : "Apagar e recriar consultas do zero"}
          </button>
        </div>
      )}

      {modalRealizar && (
        <div className="modal-overlay" onClick={() => setModalRealizar(null)}>
          <form
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={confirmarRealizada}
          >
            <h2>Marcar consulta #{modalRealizar.numero} como realizada</h2>

            <label>
              Data real da consulta
              <input
                type="date"
                value={formRealizar.data}
                onChange={(e) => setFormRealizar((f) => ({ ...f, data: e.target.value }))}
                required
              />
            </label>

            <label>
              O que foi feito nessa consulta
              <input
                type="text"
                value={formRealizar.observacao}
                onChange={(e) =>
                  setFormRealizar((f) => ({ ...f, observacao: e.target.value }))
                }
                placeholder="Ex: moldagem, prova da prótese..."
                required
              />
            </label>

            <div>
              <span className="label-texto">Etapas concluídas nesta consulta (opcional)</span>
              {ETAPAS.filter((et) => !etapasJaFeitas.has(et)).length > 0 ? (
                <div className="etapas-checklist">
                  {ETAPAS.filter((et) => !etapasJaFeitas.has(et)).map((et) => (
                    <label key={et} className="checkbox-linha">
                      <input
                        type="checkbox"
                        checked={formRealizar.etapas.includes(et)}
                        onChange={() => toggleEtapaSelecionada(et)}
                      />
                      {et}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="modal-aviso">Todas as etapas já foram registradas.</p>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" disabled={salvandoRealizar}>
                {salvandoRealizar ? "Salvando..." : "Confirmar"}
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setModalRealizar(null)}
                disabled={salvandoRealizar}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {modalDetalhe && (
        <div className="modal-overlay" onClick={fecharDetalhe}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Consulta #{modalDetalhe.numero}</h2>

            <p className="modal-aviso">
              Data prevista: <strong>{formatDate(modalDetalhe.data_prevista)}</strong>
            </p>

            {modalDetalhe.realizada ? (
              <>
                <p className="modal-aviso">
                  Realizada em: <strong>{formatDate(modalDetalhe.data_realizada)}</strong>
                </p>
                <p className="modal-aviso">
                  Observação: <strong>{modalDetalhe.observacao || "—"}</strong>
                </p>
              </>
            ) : (
              <p className="modal-aviso">Ainda não foi realizada.</p>
            )}

            <div>
              <h3>Etapas concluídas nesta consulta</h3>
              {etapasDaConsulta.length > 0 ? (
                <div className="etapa-modal-lista">
                  {etapasDaConsulta.map((entry) => (
                    <div className="etapa-registro" key={entry.id}>
                      <div>
                        <span className="etapa-registro-info">
                          {entry.etapa} — {entry.dentistas?.nome ?? "—"} ·{" "}
                          {formatDate(entry.data)}
                        </span>
                        {entry.observacao && (
                          <p className="etapa-registro-obs">{entry.observacao}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="modal-aviso">Nenhuma etapa vinculada a esta consulta.</p>
              )}
            </div>

            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={fecharDetalhe}>
                Fechar
              </button>
            </div>
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
