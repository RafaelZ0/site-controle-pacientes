import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const STATUS_LABEL = {
  "EM ATRASO": "em atraso",
  "EM DIA": "em dia",
  REALIZADA: "realizada",
};

export default function ConsultasParcelas({ pacienteId }) {
  const [consultas, setConsultas] = useState([]);
  const [parcelas, setParcelas] = useState([]);
  const [error, setError] = useState(null);

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

  return (
    <div className="consultas-parcelas">
      {error && <p className="error">{error}</p>}

      <div className="cp-columns">
        <div>
          <h3>Consultas</h3>
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
              {consultas.map((c) => (
                <tr key={c.id}>
                  <td>{c.numero}</td>
                  <td>{formatDate(c.data_prevista)}</td>
                  <td>
                    <span className={`badge badge-consulta-${c.status.toLowerCase().replace(" ", "-")}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={c.realizada}
                      onChange={() => toggleConsulta(c)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h3>Parcelas</h3>
          <table className="cp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Vencimento</th>
                <th>Paga</th>
              </tr>
            </thead>
            <tbody>
              {parcelas.map((p) => (
                <tr key={p.id}>
                  <td>{p.numero}</td>
                  <td>{formatDate(p.data_vencimento)}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={p.paga}
                      onChange={() => toggleParcela(p)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
