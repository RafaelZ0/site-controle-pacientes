import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../supabaseClient";
import { iniciais } from "../lib/avatar";
import { useWorkspace } from "../lib/WorkspaceContext";
import PacienteForm from "./PacienteForm";
import HistoricoEtapas from "./HistoricoEtapas";
import ConsultasParcelas from "./ConsultasParcelas";
import EnviarAjusteAction from "./EnviarAjusteAction";
import Financeiro from "./Financeiro";

export default function PacienteEditar({ pacienteId, tratamentoId, onSaved, onCancel }) {
  const { workspace } = useWorkspace();
  const [aba, setAba] = useState("status");
  const [nome, setNome] = useState("");
  const [tratamentos, setTratamentos] = useState([]);
  const [tratamentoAtualId, setTratamentoAtualId] = useState(tratamentoId ?? null);
  const [mostrarNovoTratamento, setMostrarNovoTratamento] = useState(false);
  const [error, setError] = useState(null);

  async function carregarTratamentos() {
    const { data, error } = await supabase
      .from("tratamentos_status")
      .select("id, servico_nome, configuracao_pendente, created_at")
      .eq("paciente_id", pacienteId)
      .order("created_at");
    if (error) {
      setError(error.message);
      return;
    }
    setTratamentos(data ?? []);
    setTratamentoAtualId((atual) => {
      if (atual && data?.some((t) => t.id === atual)) return atual;
      return data?.[0]?.id ?? null;
    });
  }

  useEffect(() => {
    supabase
      .from("pacientes")
      .select("nome_completo")
      .eq("id", pacienteId)
      .single()
      .then(({ data }) => setNome(data?.nome_completo ?? ""));
    carregarTratamentos();
  }, [pacienteId]);

  const tratamentoAtual = tratamentos.find((t) => t.id === tratamentoAtualId);

  return (
    <div className="paciente-editar">
      <div className="paciente-editar-header">
        {nome && <span className="avatar avatar-lg">{iniciais(nome)}</span>}
        <h2>{nome || "Editar paciente"}</h2>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="tratamentos-seletor">
        {tratamentos.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`tratamento-chip ${t.id === tratamentoAtualId ? "ativo" : ""}`}
            onClick={() => setTratamentoAtualId(t.id)}
          >
            {t.servico_nome ?? "Sem serviço definido"}
            {t.configuracao_pendente && (
              <span className="badge badge-inadimplente badge-inline">Pendente</span>
            )}
          </button>
        ))}
        <button
          type="button"
          className="btn-outline tratamento-chip-adicionar"
          onClick={() => setMostrarNovoTratamento(true)}
        >
          <Plus size={14} strokeWidth={2} />
          Novo tratamento
        </button>
      </div>

      {tratamentoAtual?.configuracao_pendente && (
        <p className="aviso-config-pendente">
          Configuração pendente — defina o nº de consultas na aba "Status do
          tratamento" e o financeiro na aba "Financeiro" pra gerar o plano
          deste tratamento.
        </p>
      )}

      <div className="tabs">
        <button
          type="button"
          className={aba === "status" ? "ativo" : ""}
          onClick={() => setAba("status")}
        >
          Status do tratamento
        </button>
        <button
          type="button"
          className={aba === "financeiro" ? "ativo" : ""}
          onClick={() => setAba("financeiro")}
        >
          Financeiro
        </button>
        <button
          type="button"
          className={aba === "cadastro" ? "ativo" : ""}
          onClick={() => setAba("cadastro")}
        >
          Dados cadastrais
        </button>
      </div>

      {aba === "cadastro" && (
        <PacienteForm pacienteId={pacienteId} onSaved={onSaved} onCancel={onCancel} />
      )}

      {aba === "status" && tratamentoAtualId && (
        <div className="paciente-status">
          <EnviarAjusteAction tratamentoId={tratamentoAtualId} />
          <HistoricoEtapas tratamentoId={tratamentoAtualId} />
          <ConsultasParcelas tratamentoId={tratamentoAtualId} />
        </div>
      )}

      {aba === "financeiro" && tratamentoAtualId && (
        <Financeiro tratamentoId={tratamentoAtualId} />
      )}

      {(aba === "status" || aba === "financeiro") && !tratamentoAtualId && (
        <p className="modal-aviso">
          Nenhum tratamento cadastrado ainda. Use "Novo tratamento" acima.
        </p>
      )}

      {mostrarNovoTratamento && (
        <NovoTratamentoModal
          pacienteId={pacienteId}
          workspace={workspace}
          onClose={() => setMostrarNovoTratamento(false)}
          onCriado={(novoId) => {
            setMostrarNovoTratamento(false);
            setTratamentoAtualId(novoId);
            carregarTratamentos();
          }}
        />
      )}
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function NovoTratamentoModal({ pacienteId, workspace, onClose, onCriado }) {
  const [servicos, setServicos] = useState([]);
  const [servicoId, setServicoId] = useState("");
  const [dataInicio, setDataInicio] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from("servicos")
      .select("id, nome, num_consultas_padrao")
      .eq("ativo", true)
      .eq("workspace", workspace)
      .order("nome")
      .then(({ data }) => setServicos(data ?? []));
  }, [workspace]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const servicoEscolhido = servicos.find((s) => s.id === servicoId);

    const { data: paciente, error: pacienteError } = await supabase
      .from("pacientes")
      .select("dentista_id, dentista_2_id")
      .eq("id", pacienteId)
      .single();
    if (pacienteError) {
      setLoading(false);
      setError(pacienteError.message);
      return;
    }

    const { data: tratamento, error: tratamentoError } = await supabase
      .from("tratamentos")
      .insert({
        paciente_id: pacienteId,
        servico_id: servicoId || null,
        data_inicio: dataInicio,
        num_consultas: servicoEscolhido?.num_consultas_padrao ?? 0,
      })
      .select()
      .single();
    if (tratamentoError) {
      setLoading(false);
      setError(tratamentoError.message);
      return;
    }

    const { error: etapaError } = await supabase.from("historico_etapas").insert({
      tratamento_id: tratamento.id,
      etapa: "AVALIAÇÃO",
      dentista_id: paciente?.dentista_id ?? paciente?.dentista_2_id,
      data: dataInicio,
    });
    setLoading(false);
    if (etapaError) {
      setError(
        `Tratamento criado, mas não foi possível registrar a etapa inicial (AVALIAÇÃO): ${etapaError.message}.`
      );
      return;
    }

    onCriado?.(tratamento.id);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Novo tratamento</h2>

        <label>
          Serviço
          <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} required>
            <option value="" disabled>
              Selecione...
            </option>
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>

        <label>
          Data de início
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            required
          />
        </label>

        <span className="label-ajuda">
          Financeiro (parcelas) e nº de consultas ficam pendentes de
          configurar em seguida, na aba Financeiro desse tratamento.
        </span>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button type="submit" disabled={loading}>
            {loading ? "Criando..." : "Criar tratamento"}
          </button>
          <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
