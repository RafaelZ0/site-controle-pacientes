import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { ETAPAS } from "../lib/constants";

export default function Busca({ onEditPaciente }) {
  const [dentistas, setDentistas] = useState([]);
  const [dentistaId, setDentistaId] = useState("");
  const [busca, setBusca] = useState("");
  const [etapa, setEtapa] = useState("");
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from("dentistas")
      .select("id, nome")
      .order("nome")
      .then(({ data }) => setDentistas(data ?? []));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from("pacientes_status")
      .select("*")
      .order("nome_completo");

    if (dentistaId) query = query.eq("dentista_id", dentistaId);
    if (etapa) query = query.eq("etapa_atual", etapa);
    if (busca.trim()) {
      const termo = busca.trim().replace(/[%,]/g, "");
      query = query.or(
        `nome_completo.ilike.%${termo}%,telefone.ilike.%${termo}%,cpf.ilike.%${termo}%`
      );
    }

    const timeout = setTimeout(() => {
      query.then(({ data, error }) => {
        setLoading(false);
        if (error) setError(error.message);
        else setPacientes(data);
      });
    }, 250); // debounce da busca

    return () => clearTimeout(timeout);
  }, [dentistaId, busca, etapa]);

  return (
    <div className="busca-page">
      <h2>Pacientes</h2>

      <div className="filtros">
        <select value={dentistaId} onChange={(e) => setDentistaId(e.target.value)}>
          <option value="">Todos os dentistas</option>
          {dentistas.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Buscar por nome, telefone ou CPF..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        <select value={etapa} onChange={(e) => setEtapa(e.target.value)}>
          <option value="">Todas as etapas</option>
          {ETAPAS.map((et) => (
            <option key={et} value={et}>
              {et}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p>Carregando...</p>}

      <div className="pacientes-table-wrap">
        <table className="pacientes-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Dentista</th>
              <th>Etapa</th>
              <th>Início</th>
              <th>Fim previsto</th>
              <th>Próxima consulta</th>
              <th>Pagamento</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pacientes.map((p) => (
              <tr key={p.id}>
                <td>{p.nome_completo}</td>
                <td>{p.dentista_nome}</td>
                <td>
                  <span className="badge badge-neutro">{p.etapa_atual}</span>
                </td>
                <td>{formatDate(p.data_inicio)}</td>
                <td>{formatDate(p.data_fim_prevista)}</td>
                <td>{formatDate(p.proxima_consulta) ?? "—"}</td>
                <td>
                  <span className={`badge badge-${p.status_pagamento.toLowerCase()}`}>
                    {p.status_pagamento}
                  </span>
                </td>
                <td>
                  <button type="button" onClick={() => onEditPaciente(p.id)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {!loading && pacientes.length === 0 && (
              <tr>
                <td colSpan={8} className="estado-vazio">
                  <div className="estado-vazio-conteudo">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span>Nenhum paciente encontrado.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
