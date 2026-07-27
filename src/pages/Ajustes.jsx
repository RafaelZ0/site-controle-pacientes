import { useEffect, useMemo, useState } from "react";
import { Wrench, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "../supabaseClient";
import { iniciais } from "../lib/avatar";

const CAMPO_COMPARADORES = {
  nome_completo: (a, b) => comparaTexto(a.pacientes?.nome_completo, b.pacientes?.nome_completo),
  dentista_nome: (a, b) => comparaTexto(a.dentistas?.nome, b.dentistas?.nome),
  etapa_atual: (a, b) => comparaTexto(a.etapaAtual, b.etapaAtual),
  data: (a, b) => comparaTexto(a.data, b.data),
  status: (a, b) => (a.concluido === b.concluido ? 0 : a.concluido ? 1 : -1),
};

export default function Ajustes({ onEditPaciente }) {
  const [ajustes, setAjustes] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState("TODOS"); // TODOS | PENDENTES
  const [sort, setSort] = useState({ campo: "data", dir: "asc" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function carregar() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("historico_etapas")
      .select("id, paciente_id, dentista_id, data, concluido, concluido_em, dentistas(nome), pacientes(nome_completo)")
      .eq("etapa", "AJUSTES");

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    const pacienteIds = Array.from(new Set((data ?? []).map((a) => a.paciente_id)));
    const { data: statusData, error: statusError } = await supabase
      .from("pacientes_status")
      .select("id, etapa_atual")
      .in("id", pacienteIds.length ? pacienteIds : ["00000000-0000-0000-0000-000000000000"]);

    setLoading(false);

    if (statusError) {
      setError(statusError.message);
      return;
    }

    const etapaAtualPorPaciente = Object.fromEntries(
      (statusData ?? []).map((p) => [p.id, p.etapa_atual])
    );

    setAjustes(
      (data ?? []).map((a) => ({ ...a, etapaAtual: etapaAtualPorPaciente[a.paciente_id] ?? null }))
    );
  }

  useEffect(() => {
    carregar();
  }, []);

  async function toggleConcluido(registro) {
    const concluido = !registro.concluido;
    const { error } = await supabase
      .from("historico_etapas")
      .update({ concluido, concluido_em: concluido ? new Date().toISOString() : null })
      .eq("id", registro.id);
    if (error) setError(error.message);
    else carregar();
  }

  function ordenarPor(campo) {
    setSort((s) =>
      s.campo === campo ? { campo, dir: s.dir === "asc" ? "desc" : "asc" } : { campo, dir: "asc" }
    );
  }

  const ajustesFiltrados = useMemo(
    () => (filtroStatus === "PENDENTES" ? ajustes.filter((a) => !a.concluido) : ajustes),
    [ajustes, filtroStatus]
  );

  const ajustesOrdenados = useMemo(() => {
    const comparador = CAMPO_COMPARADORES[sort.campo];
    if (!comparador) return ajustesFiltrados;
    const ordenados = [...ajustesFiltrados].sort(comparador);
    if (sort.dir === "desc") ordenados.reverse();
    return ordenados;
  }, [ajustesFiltrados, sort]);

  return (
    <div className="ajustes-page">
      <h2>Ajustes</h2>
      <p className="ajustes-descricao">
        Fila de pacientes enviados para ajustes (Dr. Matheus). Concluídos continuam
        aqui, só marcados como feitos.
      </p>

      <div className="filtros">
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="TODOS">Enviados e concluídos</option>
          <option value="PENDENTES">Somente enviados</option>
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p>Carregando...</p>}

      <div className="pacientes-table-wrap">
        <table className="pacientes-table">
          <thead>
            <tr>
              <ThOrdenavel campo="nome_completo" sort={sort} onClick={ordenarPor}>
                Nome
              </ThOrdenavel>
              <ThOrdenavel campo="dentista_nome" sort={sort} onClick={ordenarPor}>
                Dentista principal
              </ThOrdenavel>
              <ThOrdenavel campo="etapa_atual" sort={sort} onClick={ordenarPor}>
                Etapa atual
              </ThOrdenavel>
              <ThOrdenavel campo="data" sort={sort} onClick={ordenarPor}>
                Enviado em
              </ThOrdenavel>
              <ThOrdenavel campo="status" sort={sort} onClick={ordenarPor}>
                Status
              </ThOrdenavel>
              <th>Concluído</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ajustesOrdenados.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="paciente-nome-cell">
                    <span className="avatar">{iniciais(a.pacientes?.nome_completo)}</span>
                    {a.pacientes?.nome_completo ?? "—"}
                  </div>
                </td>
                <td>{a.dentistas?.nome ?? "—"}</td>
                <td>
                  {a.etapaAtual && <span className="badge badge-neutro">{a.etapaAtual}</span>}
                </td>
                <td>{formatDate(a.data)}</td>
                <td>
                  <span className={`badge ${a.concluido ? "badge-adimplente" : "badge-neutro"}`}>
                    {a.concluido ? "Concluído" : "Pendente"}
                  </span>
                </td>
                <td>
                  <label className="check-touch">
                    <input
                      type="checkbox"
                      checked={a.concluido}
                      onChange={() => toggleConcluido(a)}
                    />
                  </label>
                </td>
                <td>
                  <button type="button" onClick={() => onEditPaciente(a.paciente_id)}>
                    Ver paciente
                  </button>
                </td>
              </tr>
            ))}
            {!loading && ajustesOrdenados.length === 0 && (
              <tr>
                <td colSpan={7} className="estado-vazio">
                  <div className="estado-vazio-conteudo">
                    <Wrench size={28} strokeWidth={1.5} />
                    <span>
                      {filtroStatus === "PENDENTES"
                        ? "Nenhum paciente pendente de ajuste."
                        : "Nenhum paciente na fila de ajustes."}
                    </span>
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

function ThOrdenavel({ campo, sort, onClick, children }) {
  const ativo = sort.campo === campo;
  return (
    <th className="th-ordenavel" onClick={() => onClick(campo)}>
      <span className="th-ordenavel-conteudo">
        {children}
        {ativo &&
          (sort.dir === "asc" ? (
            <ChevronUp size={13} strokeWidth={2} />
          ) : (
            <ChevronDown size={13} strokeWidth={2} />
          ))}
      </span>
    </th>
  );
}

function comparaTexto(a, b) {
  return (a ?? "").localeCompare(b ?? "", "pt-BR");
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
