import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { supabase } from "../supabaseClient";
import { iniciais } from "../lib/avatar";

export default function Ajustes({ onEditPaciente }) {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function carregar() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("solicitacoes_ajuste")
      .select("*, pacientes(nome_completo, dentistas(nome))")
      .order("criado_em");
    setLoading(false);
    if (error) setError(error.message);
    else setSolicitacoes(data ?? []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function toggleConcluido(solicitacao) {
    const concluido = !solicitacao.concluido;
    const { error } = await supabase
      .from("solicitacoes_ajuste")
      .update({ concluido, concluido_em: concluido ? new Date().toISOString() : null })
      .eq("id", solicitacao.id);
    if (error) setError(error.message);
    else carregar();
  }

  const solicitacoesOrdenadas = [...solicitacoes].sort((a, b) => {
    if (a.concluido !== b.concluido) return a.concluido ? 1 : -1;
    if (!a.concluido) return new Date(a.criado_em) - new Date(b.criado_em);
    return new Date(b.concluido_em) - new Date(a.concluido_em);
  });

  return (
    <div className="ajustes-page">
      <h2>Ajustes</h2>
      <p className="ajustes-descricao">
        Fila de pacientes enviados para ajustes (Dr. Matheus). Concluídos continuam
        aqui, só marcados como feitos.
      </p>

      {error && <p className="error">{error}</p>}
      {loading && <p>Carregando...</p>}

      <div className="pacientes-table-wrap">
        <table className="pacientes-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Dentista principal</th>
              <th>Enviado em</th>
              <th>Status</th>
              <th>Concluído</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {solicitacoesOrdenadas.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="paciente-nome-cell">
                    <span className="avatar">{iniciais(s.pacientes?.nome_completo)}</span>
                    {s.pacientes?.nome_completo ?? "—"}
                  </div>
                </td>
                <td>{s.pacientes?.dentistas?.nome ?? "—"}</td>
                <td>{formatDate(s.criado_em)}</td>
                <td>
                  <span className={`badge ${s.concluido ? "badge-adimplente" : "badge-neutro"}`}>
                    {s.concluido ? "Concluído" : "Pendente"}
                  </span>
                </td>
                <td>
                  <label className="check-touch">
                    <input
                      type="checkbox"
                      checked={s.concluido}
                      onChange={() => toggleConcluido(s)}
                    />
                  </label>
                </td>
                <td>
                  <button type="button" onClick={() => onEditPaciente(s.paciente_id)}>
                    Ver paciente
                  </button>
                </td>
              </tr>
            ))}
            {!loading && solicitacoes.length === 0 && (
              <tr>
                <td colSpan={6} className="estado-vazio">
                  <div className="estado-vazio-conteudo">
                    <Wrench size={28} strokeWidth={1.5} />
                    <span>Nenhum paciente na fila de ajustes.</span>
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
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}
