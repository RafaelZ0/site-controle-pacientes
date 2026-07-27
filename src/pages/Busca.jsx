import { useEffect, useMemo, useState } from "react";
import { Search, ChevronUp, ChevronDown, Download } from "lucide-react";
import { supabase } from "../supabaseClient";
import { ETAPAS } from "../lib/constants";
import { iniciais } from "../lib/avatar";
import { useWorkspace } from "../lib/WorkspaceContext";
import ResumoCards from "./ResumoCards";
import ExportarCsvModal from "./ExportarCsvModal";

const CAMPO_COMPARADORES = {
  nome_completo: (a, b) => comparaTexto(a.nome_completo, b.nome_completo),
  dentista_nome: (a, b) => comparaTexto(a.dentista_nome, b.dentista_nome),
  dentista_2_nome: (a, b) => comparaTexto(a.dentista_2_nome, b.dentista_2_nome),
  etapa_atual: (a, b) => ETAPAS.indexOf(a.etapa_atual) - ETAPAS.indexOf(b.etapa_atual),
  data_inicio: (a, b) => comparaData(a.data_inicio, b.data_inicio),
  data_fim_prevista: (a, b) => comparaData(a.data_fim_prevista, b.data_fim_prevista),
  proxima_consulta: (a, b) => comparaData(a.proxima_consulta, b.proxima_consulta),
  status_pagamento: (a, b) => comparaTexto(a.status_pagamento, b.status_pagamento),
};

export default function Busca({ onEditPaciente }) {
  const { workspace } = useWorkspace();
  const [dentistas, setDentistas] = useState([]);
  const [dentistaId, setDentistaId] = useState("");
  const [busca, setBusca] = useState("");
  const [etapa, setEtapa] = useState("");
  const [statusFiltro, setStatusFiltro] = useState(null);
  const [sort, setSort] = useState({ campo: "nome_completo", dir: "asc" });
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mostrarExportar, setMostrarExportar] = useState(false);

  useEffect(() => {
    supabase
      .from("dentistas")
      .select("id, nome")
      .eq("workspace", workspace)
      .order("nome")
      .then(({ data }) => setDentistas(data ?? []));
  }, [workspace]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from("pacientes_status")
      .select("*")
      .eq("workspace", workspace)
      .order("nome_completo");

    if (dentistaId) {
      query = query.or(`dentista_id.eq.${dentistaId},dentista_2_id.eq.${dentistaId}`);
    }
    if (etapa) query = query.eq("etapa_atual", etapa);
    if (busca.trim()) {
      // Escapa aspas e tira % pra não interferir no curinga do ilike; o
      // valor vai entre aspas duplas pra o Supabase não quebrar a leitura
      // do filtro quando o texto tiver vírgula, parênteses ou dois-pontos.
      const termo = busca.trim().replace(/%/g, "").replace(/"/g, '""');
      query = query.or(
        `nome_completo.ilike."%${termo}%",telefone.ilike."%${termo}%",cpf.ilike."%${termo}%"`
      );
    }
    if (statusFiltro === "EM_ATRASO") {
      query = query.eq("tem_consulta_atrasada", true);
    } else if (statusFiltro === "INADIMPLENTE") {
      query = query.eq("status_pagamento", "INADIMPLENTE");
    } else if (statusFiltro === "PROX_7_DIAS") {
      const hoje = new Date();
      const em7dias = new Date();
      em7dias.setDate(hoje.getDate() + 7);
      query = query
        .gte("proxima_consulta", hoje.toISOString().slice(0, 10))
        .lte("proxima_consulta", em7dias.toISOString().slice(0, 10));
    } else if (statusFiltro === "CONFIG_PENDENTE") {
      query = query.eq("configuracao_pendente", true);
    } else if (statusFiltro === "SEM_DUPLA") {
      query = query.or("dentista_id.is.null,dentista_2_id.is.null");
    }

    const timeout = setTimeout(() => {
      query.then(({ data, error }) => {
        setLoading(false);
        if (error) setError(error.message);
        else setPacientes(data);
      });
    }, 250); // debounce da busca

    return () => clearTimeout(timeout);
  }, [workspace, dentistaId, busca, etapa, statusFiltro]);

  const pacientesOrdenados = useMemo(() => {
    const comparador = CAMPO_COMPARADORES[sort.campo];
    if (!comparador) return pacientes;
    const ordenados = [...pacientes].sort(comparador);
    if (sort.dir === "desc") ordenados.reverse();
    return ordenados;
  }, [pacientes, sort]);

  function ordenarPor(campo) {
    setSort((s) =>
      s.campo === campo ? { campo, dir: s.dir === "asc" ? "desc" : "asc" } : { campo, dir: "asc" }
    );
  }

  function alternarStatusFiltro(filtro) {
    if (filtro === null) {
      setStatusFiltro(null);
      return;
    }
    setStatusFiltro((atual) => (atual === filtro ? null : filtro));
  }

  const dentistaSelecionado = dentistas.find((d) => d.id === dentistaId);

  return (
    <div className="busca-page">
      <h2>Pacientes</h2>

      <ResumoCards
        dentistaId={dentistaId || null}
        dentistaNome={dentistaSelecionado?.nome}
        statusFiltro={statusFiltro}
        onToggleFiltro={alternarStatusFiltro}
        mostrarSemDupla={workspace === "curso"}
      />

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

        <button
          type="button"
          className="btn-outline btn-exportar"
          onClick={() => setMostrarExportar(true)}
        >
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
                {workspace === "curso" ? "Dentista 1" : "Dentista"}
              </ThOrdenavel>
              {workspace === "curso" && (
                <ThOrdenavel campo="dentista_2_nome" sort={sort} onClick={ordenarPor}>
                  Dentista 2
                </ThOrdenavel>
              )}
              <ThOrdenavel campo="etapa_atual" sort={sort} onClick={ordenarPor}>
                Etapa
              </ThOrdenavel>
              <ThOrdenavel campo="data_inicio" sort={sort} onClick={ordenarPor}>
                Início
              </ThOrdenavel>
              <ThOrdenavel campo="data_fim_prevista" sort={sort} onClick={ordenarPor}>
                Fim previsto
              </ThOrdenavel>
              <ThOrdenavel campo="proxima_consulta" sort={sort} onClick={ordenarPor}>
                Próxima consulta
              </ThOrdenavel>
              <ThOrdenavel campo="status_pagamento" sort={sort} onClick={ordenarPor}>
                Pagamento
              </ThOrdenavel>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pacientesOrdenados.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="paciente-nome-cell">
                    <span className="avatar">{iniciais(p.nome_completo)}</span>
                    {p.nome_completo}
                  </div>
                </td>
                <td>{p.dentista_nome ?? "Sem dentista definido"}</td>
                {workspace === "curso" && (
                  <td>{p.dentista_2_nome ?? "Sem dentista definido"}</td>
                )}
                <td>
                  <span className="badge badge-neutro">{p.etapa_atual}</span>
                  {p.configuracao_pendente && (
                    <span className="badge badge-inadimplente badge-inline">
                      Config. pendente
                    </span>
                  )}
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
                <td colSpan={workspace === "curso" ? 9 : 8} className="estado-vazio">
                  <div className="estado-vazio-conteudo">
                    <Search size={28} strokeWidth={1.5} />
                    <span>Nenhum paciente encontrado.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && pacientes.length > 0 && (
        <p className="contagem-resultados">Mostrando {pacientes.length} pacientes</p>
      )}

      {mostrarExportar && (
        <ExportarCsvModal
          dentistas={dentistas}
          onClose={() => setMostrarExportar(false)}
        />
      )}
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

function comparaData(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function formatDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
