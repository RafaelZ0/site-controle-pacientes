import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const STATUS_LABEL = {
  "EM ATRASO": "em atraso",
  "EM DIA": "em dia",
  REALIZADA: "realizada",
};

const LIMITE_PADRAO = 4;
const PRIORIDADE_CONSULTA = { "EM ATRASO": 0, "EM DIA": 1, REALIZADA: 2 };

export default function ConsultasParcelas({ pacienteId }) {
  const [aba, setAba] = useState("consultas");
  const [consultas, setConsultas] = useState([]);
  const [parcelas, setParcelas] = useState([]);
  const [error, setError] = useState(null);
  const [verTodasConsultas, setVerTodasConsultas] = useState(false);
  const [verTodasParcelas, setVerTodasParcelas] = useState(false);

  async function carregar() {
    const [c, p] = await Promise.all([
      supabase
        .from("consultas_status")
        .select("*")
        .eq("paciente_id", pacienteId)
        .order("numero"),
      supabase
        .from("parcelas")
        .select("*")
        .eq("paciente_id", pacienteId)
        .order("numero"),
    ]);
    if (c.error) setError(c.error.message);
    else setConsultas(c.data);
    if (p.error) setError(p.error.message);
    else setParcelas(p.data);
  }

  useEffect(() => {
    carregar();
  }, [pacienteId]);

  async function toggleConsulta(consulta) {
    const realizada = !consulta.realizada;
    const { error } = await supabase
      .from("consultas")
      .update({
        realizada,
        data_realizada: realizada ? todayISO() : null,
      })
      .eq("id", consulta.id);
    if (error) setError(error.message);
    else carregar();
  }

  async function toggleParcela(parcela) {
    const paga = !parcela.paga;
    const { error } = await supabase
      .from("parcelas")
      .update({
        paga,
        data_pagamento: paga ? todayISO() : null,
      })
      .eq("id", parcela.id);
    if (error) setError(error.message);
    else carregar();
  }

  const hoje = todayISO();

  const consultasOrdenadas = [...consultas].sort(
    (a, b) =>
      (PRIORIDADE_CONSULTA[a.status] ?? 1) - (PRIORIDADE_CONSULTA[b.status] ?? 1) ||
      a.numero - b.numero
  );
  const consultasVisiveis = verTodasConsultas
    ? consultasOrdenadas
    : consultasOrdenadas.slice(0, LIMITE_PADRAO);

  const parcelasOrdenadas = [...parcelas].sort(
    (a, b) => prioridadeParcela(a, hoje) - prioridadeParcela(b, hoje) || a.numero - b.numero
  );
  const parcelasVisiveis = verTodasParcelas
    ? parcelasOrdenadas
    : parcelasOrdenadas.slice(0, LIMITE_PADRAO);

  return (
    <div className="consultas-parcelas">
      <div className="tabs">
        <button
          type="button"
          className={aba === "consultas" ? "ativo" : ""}
          onClick={() => setAba("consultas")}
        >
          Consultas
        </button>
        <button
          type="button"
          className={aba === "parcelas" ? "ativo" : ""}
          onClick={() => setAba("parcelas")}
        >
          Parcelas
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {aba === "consultas" && (
        <>
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
                <tr key={c.id}>
                  <td>{c.numero}</td>
                  <td>{formatDate(c.data_prevista)}</td>
                  <td>
                    <span className={`badge badge-consulta-${c.status.toLowerCase().replace(" ", "-")}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td>
                    <label className="check-touch">
                      <input
                        type="checkbox"
                        checked={c.realizada}
                        onChange={() => toggleConsulta(c)}
                      />
                    </label>
                  </td>
                </tr>
              ))}
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
        </>
      )}

      {aba === "parcelas" && (
        <>
          <table className="cp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Vencimento</th>
                <th>Paga</th>
              </tr>
            </thead>
            <tbody>
              {parcelasVisiveis.map((p) => (
                <tr key={p.id}>
                  <td>{p.numero}</td>
                  <td>{formatDate(p.data_vencimento)}</td>
                  <td>
                    <label className="check-touch">
                      <input
                        type="checkbox"
                        checked={p.paga}
                        onChange={() => toggleParcela(p)}
                      />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {parcelas.length > LIMITE_PADRAO && (
            <button
              type="button"
              className="btn-outline ver-todas"
              onClick={() => setVerTodasParcelas((v) => !v)}
            >
              {verTodasParcelas ? "Mostrar menos" : `Ver todas as ${parcelas.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function prioridadeParcela(parcela, hojeISO) {
  if (parcela.paga) return 2;
  if (parcela.data_vencimento < hojeISO) return 0;
  return 1;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
