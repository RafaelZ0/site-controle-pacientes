import { useEffect, useState } from "react";
import { Wrench, Check } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useWorkspace } from "../lib/WorkspaceContext";

// Na Clínica, quem sempre faz os ajustes é o Dr. Mateus Macedo, independente
// de qual dentista o paciente tem como responsável — então o envio já usa
// ele direto, sem precisar escolher toda vez.
const DENTISTA_AJUSTES_CLINICA = "Mateus Macedo";

export default function EnviarAjusteAction({ pacienteId }) {
  const { workspace } = useWorkspace();
  const [dentistaId, setDentistaId] = useState("");
  const [registroAberto, setRegistroAberto] = useState(undefined); // undefined = carregando
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);

  function mostrarConfirmacao(texto) {
    setConfirmacao(texto);
    setTimeout(() => setConfirmacao(null), 3000);
  }

  async function carregar() {
    const { data, error } = await supabase
      .from("historico_etapas")
      .select("id, data")
      .eq("paciente_id", pacienteId)
      .eq("etapa", "AJUSTES")
      .eq("concluido", false)
      .maybeSingle();
    if (error) setError(error.message);
    else setRegistroAberto(data ?? null);
  }

  useEffect(() => {
    setRegistroAberto(undefined);

    if (workspace === "clinica") {
      supabase
        .from("dentistas")
        .select("id")
        .eq("workspace", "clinica")
        .eq("nome", DENTISTA_AJUSTES_CLINICA)
        .maybeSingle()
        .then(({ data }) => setDentistaId(data?.id ?? ""));
    } else {
      supabase
        .from("pacientes")
        .select("dentista_id, dentista_2_id")
        .eq("id", pacienteId)
        .single()
        .then(({ data }) => setDentistaId(data?.dentista_id ?? data?.dentista_2_id ?? ""));
    }

    carregar();
  }, [pacienteId, workspace]);

  async function enviar() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from("historico_etapas").insert({
      paciente_id: pacienteId,
      etapa: "AJUSTES",
      dentista_id: dentistaId || null,
      data: todayISO(),
      concluido: false,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    mostrarConfirmacao("Enviado para ajustes.");
    carregar();
  }

  async function cancelar() {
    setError(null);
    setLoading(true);
    const { error } = await supabase
      .from("historico_etapas")
      .delete()
      .eq("id", registroAberto.id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    mostrarConfirmacao("Envio para ajustes cancelado.");
    carregar();
  }

  if (registroAberto === undefined) return null;

  return (
    <div className="ajuste-action">
      {registroAberto ? (
        <p className="ajuste-action-status">
          <Wrench size={15} strokeWidth={1.75} />
          Na fila de ajustes desde {formatDate(registroAberto.data)} —{" "}
          <button type="button" className="link-botao" onClick={cancelar} disabled={loading}>
            cancelar envio
          </button>
        </p>
      ) : (
        <button type="button" className="btn-outline" onClick={enviar} disabled={loading}>
          <Wrench size={15} strokeWidth={1.75} />
          Enviar para ajustes
        </button>
      )}
      {confirmacao && (
        <p className="ajuste-action-confirmacao">
          <Check size={14} strokeWidth={2.5} />
          {confirmacao}
        </p>
      )}
      {error && <p className="error">{error}</p>}
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
