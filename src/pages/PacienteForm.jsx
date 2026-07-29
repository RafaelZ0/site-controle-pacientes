import { useEffect, useState } from "react";
import { Phone, IdCard } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useWorkspace, NOME_WORKSPACE, OUTRO_WORKSPACE } from "../lib/WorkspaceContext";
import { especialidadesCompativeis, formatarEspecialidades } from "../lib/constants";
import ExcluirPacienteModal from "./ExcluirPacienteModal";
import TransferirPacienteModal from "./TransferirPacienteModal";

function mensagemErro(error) {
  if (error?.code === "23505" && error.message?.toLowerCase().includes("cpf")) {
    return "Já existe um paciente cadastrado com esse CPF.";
  }
  return error?.message ?? "Erro desconhecido.";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const initialForm = {
  nome_completo: "",
  telefone: "",
  cpf: "",
  dentista_id: "",
  dentista_2_id: "",
  servico_id: "",
};

export default function PacienteForm({ pacienteId, onSaved, onCancel }) {
  const { workspace } = useWorkspace();
  const [dentistas, setDentistas] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mostrarExcluir, setMostrarExcluir] = useState(false);
  const [mostrarTransferir, setMostrarTransferir] = useState(false);

  const isEdit = Boolean(pacienteId);

  useEffect(() => {
    supabase
      .from("dentistas")
      .select("id, nome, especialidades")
      .eq("ativo", true)
      .eq("workspace", workspace)
      .order("nome")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setDentistas(data);
      });
  }, [workspace]);

  useEffect(() => {
    // Serviço só é escolhido na criação (define o 1º tratamento) — editar
    // o serviço de um tratamento existente é feito na tela do tratamento.
    if (isEdit) return;
    supabase
      .from("servicos")
      .select("id, nome, num_consultas_padrao")
      .eq("ativo", true)
      .eq("workspace", workspace)
      .order("nome")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setServicos(data);
      });
  }, [workspace, isEdit]);

  useEffect(() => {
    if (!pacienteId) {
      setForm(initialForm);
      return;
    }
    supabase
      .from("pacientes")
      .select("*")
      .eq("id", pacienteId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          return;
        }
        setForm({
          nome_completo: data.nome_completo,
          telefone: data.telefone ?? "",
          cpf: data.cpf ?? "",
          dentista_id: data.dentista_id ?? "",
          dentista_2_id: data.dentista_2_id ?? "",
          servico_id: "",
        });
      });
  }, [pacienteId]);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (workspace === "curso" && form.dentista_id && form.dentista_2_id) {
      if (form.dentista_id === form.dentista_2_id) {
        setError("Dentista 1 e Dentista 2 não podem ser a mesma pessoa.");
        return;
      }
      const d1 = dentistas.find((d) => d.id === form.dentista_id);
      const d2 = dentistas.find((d) => d.id === form.dentista_2_id);
      if (!especialidadesCompativeis(d1?.especialidades, d2?.especialidades)) {
        setError(
          "Dentista 1 e Dentista 2 têm especialidades diferentes — a dupla precisa compartilhar ao menos uma especialidade."
        );
        return;
      }
    }

    setLoading(true);

    const payload = {
      nome_completo: form.nome_completo.trim(),
      telefone: form.telefone.trim() || null,
      cpf: form.cpf.trim() || null,
      dentista_id: form.dentista_id || null,
      dentista_2_id: form.dentista_2_id || null,
    };

    if (isEdit) {
      const { error } = await supabase.from("pacientes").update(payload).eq("id", pacienteId);
      if (error) {
        setLoading(false);
        setError(mensagemErro(error));
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("pacientes")
        .insert({ ...payload, workspace })
        .select()
        .single();
      if (error) {
        setLoading(false);
        setError(mensagemErro(error));
        return;
      }

      const servicoEscolhido = servicos.find((s) => s.id === form.servico_id);
      const dataInicio = todayISO();
      const { data: tratamento, error: tratamentoError } = await supabase
        .from("tratamentos")
        .insert({
          paciente_id: data.id,
          servico_id: form.servico_id || null,
          data_inicio: dataInicio,
          num_consultas: servicoEscolhido?.num_consultas_padrao ?? 0,
        })
        .select()
        .single();
      if (tratamentoError) {
        setLoading(false);
        setError(
          `Paciente criado, mas não foi possível criar o tratamento inicial: ${tratamentoError.message}.`
        );
        return;
      }

      // Toda ficha nova começa em AVALIAÇÃO, na data de início do tratamento.
      const { error: etapaError } = await supabase.from("historico_etapas").insert({
        tratamento_id: tratamento.id,
        etapa: "AVALIAÇÃO",
        dentista_id: payload.dentista_id ?? payload.dentista_2_id,
        data: dataInicio,
      });
      if (etapaError) {
        setLoading(false);
        setError(
          `Paciente criado, mas não foi possível registrar a etapa inicial (AVALIAÇÃO): ${etapaError.message}. Abra o paciente na busca e registre a etapa manualmente.`
        );
        return;
      }
    }

    setLoading(false);
    onSaved?.();
  }

  return (
    <>
    <form className="paciente-form" onSubmit={handleSubmit}>
      {!isEdit && <h2>Novo paciente</h2>}

      <label>
        Nome completo
        <input
          type="text"
          value={form.nome_completo}
          onChange={(e) => updateField("nome_completo", e.target.value)}
          required
        />
      </label>

      <label>
        <span className="label-texto">
          <Phone size={14} strokeWidth={1.75} />
          Telefone (opcional)
        </span>
        <input
          type="text"
          value={form.telefone}
          onChange={(e) => updateField("telefone", e.target.value)}
        />
      </label>

      <label>
        <span className="label-texto">
          <IdCard size={14} strokeWidth={1.75} />
          CPF (opcional)
        </span>
        <input
          type="text"
          value={form.cpf}
          onChange={(e) => updateField("cpf", e.target.value)}
        />
      </label>

      {workspace === "curso" ? (
        <>
          <label>
            Dentista 1 (opcional)
            <select
              value={form.dentista_id}
              onChange={(e) => updateField("dentista_id", e.target.value)}
            >
              <option value="">Sem dentista definido</option>
              {dentistas.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatarEspecialidades(d.especialidades)
                    ? `${d.nome} — ${formatarEspecialidades(d.especialidades)}`
                    : d.nome}
                </option>
              ))}
            </select>
          </label>

          <label>
            Dentista 2 (opcional)
            <select
              value={form.dentista_2_id}
              onChange={(e) => updateField("dentista_2_id", e.target.value)}
            >
              <option value="">Sem dentista definido</option>
              {dentistas.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatarEspecialidades(d.especialidades)
                    ? `${d.nome} — ${formatarEspecialidades(d.especialidades)}`
                    : d.nome}
                </option>
              ))}
            </select>
          </label>
          <span className="label-ajuda">
            A dupla principal pode ser definida depois — o paciente aparece em
            "Sem dupla principal" em Pacientes enquanto faltar um dos dois.
          </span>
        </>
      ) : (
        <label>
          Dentista responsável
          <select
            value={form.dentista_id}
            onChange={(e) => updateField("dentista_id", e.target.value)}
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

      {!isEdit && (
        <label>
          Serviço
          <select
            value={form.servico_id}
            onChange={(e) => updateField("servico_id", e.target.value)}
            required
          >
            <option value="" disabled>
              Selecione...
            </option>
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <span className="label-ajuda">
            Define o 1º tratamento do paciente. Financeiro (parcelas) e nº de
            consultas ficam pendentes de configurar em seguida, na aba
            Financeiro do tratamento.
          </span>
        </label>
      )}

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={loading}>
          {loading ? "Salvando..." : "Salvar"}
        </button>
        {onCancel && (
          <button
            type="button"
            className="btn-outline"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </button>
        )}
      </div>

      {isEdit && (
        <div className="transferir-paciente">
          <p>
            Transferir move o paciente pra Gestão de Pacientes do{" "}
            {NOME_WORKSPACE[OUTRO_WORKSPACE[workspace]]} — tratamentos,
            consultas, parcelas e histórico de etapas continuam intactos, só
            muda o workspace e o dentista responsável.
          </p>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setMostrarTransferir(true)}
          >
            Transferir para {NOME_WORKSPACE[OUTRO_WORKSPACE[workspace]]}
          </button>
        </div>
      )}

      {isEdit && (
        <div className="zona-perigo">
          <p>
            Excluir o paciente apaga permanentemente o cadastro e tudo que
            está ligado a ele (tratamentos, consultas, parcelas, histórico de
            etapas). Use só em casos de duplicidade.
          </p>
          <button
            type="button"
            className="btn-danger-outline"
            onClick={() => setMostrarExcluir(true)}
          >
            Excluir paciente
          </button>
        </div>
      )}
    </form>

    {mostrarExcluir && (
      <ExcluirPacienteModal
        pacienteId={pacienteId}
        pacienteNome={form.nome_completo}
        onClose={() => setMostrarExcluir(false)}
        onDeleted={() => {
          setMostrarExcluir(false);
          onSaved?.();
        }}
      />
    )}

    {mostrarTransferir && (
      <TransferirPacienteModal
        pacienteId={pacienteId}
        pacienteNome={form.nome_completo}
        onClose={() => setMostrarTransferir(false)}
        onTransferido={() => {
          setMostrarTransferir(false);
          onSaved?.();
        }}
      />
    )}
    </>
  );
}
