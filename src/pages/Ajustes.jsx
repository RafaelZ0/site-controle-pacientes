import { useEffect, useMemo, useState } from "react";
import { Wrench, ChevronUp, ChevronDown, Download, MessageSquare } from "lucide-react";
import { supabase } from "../supabaseClient";
import { iniciais } from "../lib/avatar";
import { etapaBadgeClasse } from "../lib/constants";
import { useWorkspace } from "../lib/WorkspaceContext";
import { paraCsv, baixarCsv } from "../lib/csv";

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatarMes(chave) {
  const [ano, mes] = chave.split("-");
  return `${NOMES_MES[Number(mes) - 1]} de ${ano}`;
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

// Na Clínica, quem sempre faz os ajustes é o Dr. Mateus Macedo — usado como
// valor padrão do select, mas continua editável se um dia for outra pessoa.
const DENTISTA_AJUSTES_CLINICA = "Mateus Macedo";

const CAMPO_COMPARADORES = {
  nome_completo: (a, b) => comparaTexto(a.pacientes?.nome_completo, b.pacientes?.nome_completo),
  dentista_nome: (a, b) => comparaTexto(a.dentistas?.nome, b.dentistas?.nome),
  dentista_2_nome: (a, b) => comparaTexto(a.dentista2Nome, b.dentista2Nome),
  etapa_atual: (a, b) => comparaTexto(a.etapaAtual, b.etapaAtual),
  data: (a, b) => comparaTexto(a.data, b.data),
  status: (a, b) => (a.concluido === b.concluido ? 0 : a.concluido ? 1 : -1),
};

export default function Ajustes({ onEditPaciente }) {
  const { workspace } = useWorkspace();
  const [ajustes, setAjustes] = useState([]);
  const [dentistas, setDentistas] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState("TODOS"); // TODOS | PENDENTES
  const [busca, setBusca] = useState("");
  const [mes, setMes] = useState("");
  const [sort, setSort] = useState({ campo: "data", dir: "asc" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [registroDetalhe, setRegistroDetalhe] = useState(null); // registro | null

  useEffect(() => {
    supabase
      .from("dentistas")
      .select("id, nome")
      .eq("ativo", true)
      .eq("workspace", workspace)
      .order("nome")
      .then(({ data }) => setDentistas(data ?? []));
  }, [workspace]);

  async function carregar() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("historico_etapas")
      .select(
        "id, paciente_id, dentista_id, data, observacao, concluido, concluido_em, dentistas(nome), pacientes!inner(nome_completo, workspace)"
      )
      .eq("etapa", "AJUSTES")
      .eq("pacientes.workspace", workspace);

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    const pacienteIds = Array.from(new Set((data ?? []).map((a) => a.paciente_id)));
    const { data: statusData, error: statusError } = await supabase
      .from("pacientes_status")
      .select("id, etapa_atual, dentista_2_nome")
      .in("id", pacienteIds.length ? pacienteIds : ["00000000-0000-0000-0000-000000000000"]);

    setLoading(false);

    if (statusError) {
      setError(statusError.message);
      return;
    }

    const etapaAtualPorPaciente = Object.fromEntries(
      (statusData ?? []).map((p) => [p.id, p.etapa_atual])
    );
    const dentista2NomePorPaciente = Object.fromEntries(
      (statusData ?? []).map((p) => [p.id, p.dentista_2_nome])
    );

    setAjustes(
      (data ?? []).map((a) => ({
        ...a,
        etapaAtual: etapaAtualPorPaciente[a.paciente_id] ?? null,
        dentista2Nome: dentista2NomePorPaciente[a.paciente_id] ?? null,
      }))
    );
  }

  useEffect(() => {
    carregar();
  }, [workspace]);

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

  const meses = useMemo(() => {
    const unicos = Array.from(new Set(ajustes.map((a) => a.data?.slice(0, 7)).filter(Boolean)));
    return unicos.sort((a, b) => b.localeCompare(a));
  }, [ajustes]);

  const ajustesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ajustes.filter((a) => {
      if (filtroStatus === "PENDENTES" && a.concluido) return false;
      if (mes && a.data?.slice(0, 7) !== mes) return false;
      if (termo && !a.pacientes?.nome_completo?.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [ajustes, filtroStatus, busca, mes]);

  const ajustesOrdenados = useMemo(() => {
    const comparador = CAMPO_COMPARADORES[sort.campo];
    if (!comparador) return ajustesFiltrados;
    const ordenados = [...ajustesFiltrados].sort(comparador);
    if (sort.dir === "desc") ordenados.reverse();
    return ordenados;
  }, [ajustesFiltrados, sort]);

  const stats = useMemo(() => {
    const agora = Date.now();
    const concluidosUltimos30Dias = ajustes.filter(
      (a) =>
        a.concluido &&
        a.concluido_em &&
        agora - new Date(a.concluido_em).getTime() <= 30 * UM_DIA_MS
    ).length;
    return {
      total: ajustes.length,
      pendentes: ajustes.filter((a) => !a.concluido).length,
      concluidos: ajustes.filter((a) => a.concluido).length,
      concluidosUltimos30Dias,
    };
  }, [ajustes]);

  function exportarCsv() {
    const colunas = [
      { label: "Nome", valor: (a) => a.pacientes?.nome_completo },
      { label: workspace === "curso" ? "Dentista 1" : "Dentista", valor: (a) => a.dentistas?.nome },
      ...(workspace === "curso"
        ? [{ label: "Dentista 2", valor: (a) => a.dentista2Nome }]
        : []),
      { label: "Etapa atual", valor: (a) => a.etapaAtual },
      { label: "Enviado em", valor: (a) => formatDate(a.data) },
      { label: "Status", valor: (a) => (a.concluido ? "Concluído" : "Pendente") },
      { label: "Observação", valor: (a) => a.observacao },
    ];
    const csv = paraCsv(ajustesOrdenados, colunas);
    baixarCsv(`ajustes_${todayISO()}.csv`, csv);
  }

  return (
    <div className="ajustes-page">
      <h2>Ajustes</h2>
      <p className="ajustes-descricao">
        Fila de pacientes enviados para ajustes. Concluídos continuam aqui, só
        marcados como feitos.
      </p>

      <div className="resumo-cards-wrap">
        <div className="resumo-cards">
          <div className="stat-card">
            <div className="stat-card-topo">
              <span className="stat-card-numero">{stats.total}</span>
              <Wrench size={20} strokeWidth={1.75} className="stat-card-icone" />
            </div>
            <span className="stat-card-label">Total na fila</span>
          </div>
          <div className="stat-card">
            <div className="stat-card-topo">
              <span className="stat-card-numero">{stats.pendentes}</span>
              <Wrench size={20} strokeWidth={1.75} className="stat-card-icone acento-alerta" />
            </div>
            <span className="stat-card-label">Pendentes</span>
          </div>
          <div className="stat-card">
            <div className="stat-card-topo">
              <span className="stat-card-numero">{stats.concluidos}</span>
              <Wrench size={20} strokeWidth={1.75} className="stat-card-icone acento-teal" />
            </div>
            <span className="stat-card-label">Concluídos</span>
          </div>
          <div className="stat-card">
            <div className="stat-card-topo">
              <span className="stat-card-numero">{stats.concluidosUltimos30Dias}</span>
              <Wrench size={20} strokeWidth={1.75} className="stat-card-icone acento-teal" />
            </div>
            <span className="stat-card-label">Concluídos nos últimos 30 dias</span>
          </div>
        </div>
      </div>

      <div className="filtros">
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="TODOS">Enviados e concluídos</option>
          <option value="PENDENTES">Somente enviados</option>
        </select>

        <select value={mes} onChange={(e) => setMes(e.target.value)}>
          <option value="">Todos os meses</option>
          {meses.map((m) => (
            <option key={m} value={m}>
              {formatarMes(m)}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Buscar por nome do paciente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        <button type="button" className="btn-outline btn-exportar" onClick={exportarCsv}>
          <Download size={16} strokeWidth={1.75} />
          Exportar CSV
        </button>
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
                {workspace === "curso" ? "Dentista 1" : "Dentista principal"}
              </ThOrdenavel>
              {workspace === "curso" && (
                <ThOrdenavel campo="dentista_2_nome" sort={sort} onClick={ordenarPor}>
                  Dentista 2
                </ThOrdenavel>
              )}
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
                {workspace === "curso" && <td>{a.dentista2Nome ?? "—"}</td>}
                <td>
                  {a.etapaAtual && (
                    <span className={`badge ${etapaBadgeClasse(a.etapaAtual)}`}>
                      {a.etapaAtual}
                    </span>
                  )}
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
                  <button
                    type="button"
                    className={`btn-outline btn-detalhes-ajuste${a.observacao ? " tem-observacao" : ""}`}
                    onClick={() => setRegistroDetalhe(a)}
                    title={a.observacao || "Adicionar dentista que fez e observação"}
                  >
                    <MessageSquare size={15} strokeWidth={1.75} />
                    Detalhes
                  </button>
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
                <td colSpan={workspace === "curso" ? 9 : 8} className="estado-vazio">
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

      {registroDetalhe && (
        <DetalheAjusteModal
          registro={registroDetalhe}
          dentistas={dentistas}
          onClose={() => setRegistroDetalhe(null)}
          onSalvo={() => {
            setRegistroDetalhe(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function DetalheAjusteModal({ registro, dentistas, onClose, onSalvo }) {
  const { workspace } = useWorkspace();
  const dentistaPadrao =
    workspace === "clinica"
      ? dentistas.find((d) => d.nome === DENTISTA_AJUSTES_CLINICA)?.id ?? ""
      : "";
  const [dentistaId, setDentistaId] = useState(registro.dentista_id ?? dentistaPadrao);
  const [observacao, setObservacao] = useState(registro.observacao ?? "");
  const [concluido, setConcluido] = useState(registro.concluido);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState(null);

  async function salvar(e) {
    e.preventDefault();
    setError(null);
    setSalvando(true);

    const payload = {
      dentista_id: dentistaId || null,
      observacao: observacao.trim() || null,
      concluido,
    };
    if (concluido && !registro.concluido) payload.concluido_em = new Date().toISOString();
    if (!concluido && registro.concluido) payload.concluido_em = null;

    const { error } = await supabase
      .from("historico_etapas")
      .update(payload)
      .eq("id", registro.id);

    setSalvando(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSalvo?.();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h2>Detalhes do ajuste — {registro.pacientes?.nome_completo}</h2>

        <label>
          Dentista que fez o ajuste
          <select value={dentistaId} onChange={(e) => setDentistaId(e.target.value)}>
            <option value="">Não informado</option>
            {dentistas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </label>

        <label>
          Observação
          <input
            type="text"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex: troca de resina no dente 26"
          />
        </label>

        <label className="checkbox-linha">
          <input
            type="checkbox"
            checked={concluido}
            onChange={(e) => setConcluido(e.target.checked)}
          />
          Concluído
        </label>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
          <button type="button" className="btn-outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
        </div>
      </form>
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
