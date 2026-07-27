import { useEffect, useState } from "react";
import { Phone, IdCard, Calendar } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useWorkspace, NOME_WORKSPACE, OUTRO_WORKSPACE } from "../lib/WorkspaceContext";
import ExcluirPacienteModal from "./ExcluirPacienteModal";
import TransferirPacienteModal from "./TransferirPacienteModal";

function mensagemErro(error) {
  if (error?.code === "23505" && error.message?.toLowerCase().includes("cpf")) {
    return "Já existe um paciente cadastrado com esse CPF.";
  }
  return error?.message ?? "Erro desconhecido.";
}

const initialForm = {
  nome_completo: "",
  telefone: "",
  cpf: "",
  dentista_id: "",
  dentista_2_id: "",
  data_inicio: "",
  num_parcelas: "",
  num_consultas: "",
};

const CAMPOS_CRITICOS = ["data_inicio", "num_parcelas", "num_consultas"];

export default function PacienteForm({ pacienteId, onSaved, onCancel }) {
  const { workspace } = useWorkspace();
  const [dentistas, setDentistas] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [initialCriticos, setInitialCriticos] = useState(null);
  const [avisoRecalculo, setAvisoRecalculo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [mostrarExcluir, setMostrarExcluir] = useState(false);
  const [mostrarTransferir, setMostrarTransferir] = useState(false);

  const isEdit = Boolean(pacienteId);

  useEffect(() => {
    supabase
      .from("dentistas")
      .select("id, nome")
      .eq("ativo", true)
      .eq("workspace", workspace)
      .order("nome")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setDentistas(data);
      });
  }, [workspace]);

  useEffect(() => {
    setAvisoRecalculo(false);

    if (!pacienteId) {
      setForm(initialForm);
      setInitialCriticos(null);
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
        const carregado = {
          nome_completo: data.nome_completo,
          telefone: data.telefone ?? "",
          cpf: data.cpf ?? "",
          dentista_id: data.dentista_id ?? "",
          dentista_2_id: data.dentista_2_id ?? "",
          data_inicio: data.data_inicio,
          num_parcelas: data.num_parcelas,
          num_consultas: data.num_consultas,
        };
        setForm(carregado);
        setInitialCriticos(
          Object.fromEntries(CAMPOS_CRITICOS.map((c) => [c, carregado[c]]))
        );
      });
  }, [pacienteId]);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (avisoRecalculo) setAvisoRecalculo(false);
  }

  function criticosMudaram() {
    if (!initialCriticos) return false;
    return CAMPOS_CRITICOS.some(
      (campo) => String(form[campo] ?? "") !== String(initialCriticos[campo] ?? "")
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (
      workspace === "curso" &&
      form.dentista_id &&
      form.dentista_2_id &&
      form.dentista_id === form.dentista_2_id
    ) {
      setError("Dentista 1 e Dentista 2 não podem ser a mesma pessoa.");
      return;
    }

    const precisaRecalcular = isEdit && criticosMudaram();

    if (precisaRecalcular && !avisoRecalculo) {
      setAvisoRecalculo(true);
      return;
    }

    setLoading(true);

    const payload = {
      nome_completo: form.nome_completo.trim(),
      telefone: form.telefone.trim() || null,
      cpf: form.cpf.trim() || null,
      dentista_id: form.dentista_id || null,
      dentista_2_id: form.dentista_2_id || null,
      data_inicio: form.data_inicio,
      num_parcelas: Number(form.num_parcelas),
      num_consultas: Number(form.num_consultas),
    };

    if (isEdit) {
      const { error } = await supabase.from("pacientes").update(payload).eq("id", pacienteId);
      if (error) {
        setLoading(false);
        setError(mensagemErro(error));
        return;
      }

      if (precisaRecalcular) {
        const { error: rpcError } = await supabase.rpc("recalcular_plano_paciente", {
          p_paciente_id: pacienteId,
        });
        if (rpcError) {
          setLoading(false);
          setError(rpcError.message);
          return;
        }
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
      // Toda ficha nova começa em AVALIAÇÃO, na data de início do tratamento
      // (não na data de hoje, pra não distorcer o histórico de quem cadastra
      // um paciente que já começou antes).
      const { error: etapaError } = await supabase.from("historico_etapas").insert({
        paciente_id: data.id,
        etapa: "AVALIAÇÃO",
        dentista_id: payload.dentista_id ?? payload.dentista_2_id,
        data: payload.data_inicio,
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
    setAvisoRecalculo(false);
    onSaved?.();
  }

  async function handleRegenerarPlano() {
    const [{ count: consultasFeitas }, { count: parcelasPagas }] = await Promise.all([
      supabase
        .from("consultas")
        .select("id", { count: "exact", head: true })
        .eq("paciente_id", pacienteId)
        .eq("realizada", true),
      supabase
        .from("parcelas")
        .select("id", { count: "exact", head: true })
        .eq("paciente_id", pacienteId)
        .eq("paga", true),
    ]);

    const confirmado = window.confirm(
      `Isso vai apagar TODAS as consultas e parcelas deste paciente e recriar do zero — inclusive ${
        consultasFeitas ?? 0
      } consulta(s) já realizada(s) e ${
        parcelasPagas ?? 0
      } parcela(s) já paga(s), que serão perdidas. Essa ação não pode ser desfeita. Continuar?`
    );
    if (!confirmado) return;

    setError(null);
    setInfo(null);
    setRegenerando(true);
    const { error } = await supabase.rpc("gerar_plano_paciente", {
      p_paciente_id: pacienteId,
    });
    setRegenerando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInfo("Plano de consultas e parcelas regenerado do zero a partir dos dados atuais.");
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
                  {d.nome}
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
                  {d.nome}
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

      <label>
        <span className="label-texto">
          <Calendar size={14} strokeWidth={1.75} />
          Data de início
        </span>
        <input
          type="date"
          value={form.data_inicio}
          onChange={(e) => updateField("data_inicio", e.target.value)}
          required
        />
      </label>

      <label>
        Nº de parcelas
        <input
          type="number"
          min="0"
          value={form.num_parcelas}
          onChange={(e) => updateField("num_parcelas", e.target.value)}
          required
        />
        <span className="label-ajuda">
          Ainda não sabe? Deixe 0 — o paciente fica marcado como "configuração
          pendente" até você definir.
        </span>
      </label>

      <label>
        Nº de consultas
        <input
          type="number"
          min="0"
          value={form.num_consultas}
          onChange={(e) => updateField("num_consultas", e.target.value)}
          required
        />
        <span className="label-ajuda">
          Ainda não sabe? Deixe 0 — o paciente fica marcado como "configuração
          pendente" até você definir.
        </span>
      </label>

      {error && <p className="error">{error}</p>}
      {info && <p className="info">{info}</p>}

      {avisoRecalculo && (
        <div className="aviso-recalculo">
          Isso vai recalcular as datas das consultas e parcelas que ainda
          estão em aberto, a partir da última já concluída/paga. Nada que já
          foi marcado como realizado ou pago será alterado.
        </div>
      )}

      <div className="form-actions">
        <button type="submit" disabled={loading}>
          {loading
            ? "Salvando..."
            : avisoRecalculo
            ? "Confirmar e salvar"
            : "Salvar"}
        </button>
        {avisoRecalculo && (
          <button
            type="button"
            className="btn-outline"
            onClick={() => setAvisoRecalculo(false)}
            disabled={loading}
          >
            Voltar
          </button>
        )}
        {onCancel && !avisoRecalculo && (
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
        <div className="regenerar-plano">
          <p>
            O botão acima já recalcula sozinho as consultas/parcelas em
            aberto quando você muda início, nº de parcelas ou nº de
            consultas — preservando o que já foi realizado/pago. Se em vez
            disso você quiser <strong>apagar e
            recriar o plano inteiro do zero</strong> (perde marcações de
            realizado/pago), use o botão abaixo.
          </p>
          <button
            type="button"
            className="btn-danger-outline"
            onClick={handleRegenerarPlano}
            disabled={regenerando}
          >
            {regenerando ? "Regenerando..." : "Apagar e recriar plano do zero"}
          </button>
        </div>
      )}

      {isEdit && (
        <div className="transferir-paciente">
          <p>
            Transferir move o paciente pra Gestão de Pacientes do{" "}
            {NOME_WORKSPACE[OUTRO_WORKSPACE[workspace]]} — consultas, parcelas
            e histórico de etapas continuam intactos, só muda o workspace e o
            dentista responsável.
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
            está ligado a ele (consultas, parcelas, histórico de etapas).
            Use só em casos de duplicidade.
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
