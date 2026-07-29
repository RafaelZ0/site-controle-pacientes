import { useEffect, useState } from "react";
import { Wrench, Check } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useWorkspace } from "../lib/WorkspaceContext";

// Na Clínica, quem sempre faz os ajustes é o Dr. Mateus Macedo, independente
// de qual dentista o paciente tem como responsável — então o envio já usa
// ele direto, sem precisar escolher toda vez.
const DENTISTA_AJUSTES_CLINICA = "Mateus Macedo";

export default function EnviarAjusteAction({ tratamentoId }) {
  const { workspace } = useWorkspace();
  const [dentistaId, setDentistaId] = useState("");
  const [registrosAbertos, setRegistrosAbertos] = useState(undefined); // undefined = carregando
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
      .eq("tratamento_id", tratamentoId)
      .eq("etapa", "AJUSTES")
      .eq("concluido", false)
      .order("data");
    if (error) setError(error.message);
    else setRegistrosAbertos(data ?? []);
  }

  useEffect(() => {
    setRegistrosAbertos(undefined);

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
        .from("tratamentos")
        .select("pacientes(dentista_id, dentista_2_id)")
        .eq("id", tratamentoId)
        .single()
        .then(({ data }) =>
          setDentistaId(data?.pacientes?.dentista_id ?? data?.pacientes?.dentista_2_id ?? "")
        );
    }

    carregar();
  }, [tratamentoId, workspace]);

  async function enviar() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from("historico_etapas").insert({
      tratamento_id: tratamentoId,
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

  async function cancelar(registroId) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from("historico_etapas").delete().eq("id", registroId);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    mostrarConfirmacao("Envio para ajustes cancelado.");
    carregar();
  }

  if (registrosAbertos === undefined) return null;

  return (
    <div className="ajuste-action">
      {registrosAbertos.map((registro) => (
        <p className="ajuste-action-status" key={registro.id}>
          <Wrench size={15} strokeWidth={1.75} />
          Na fila de ajustes desde {formatDate(registro.data)} —{" "}
          <button
            type="button"
            className="link-botao"
            onClick={() => cancelar(registro.id)}
            disabled={loading}
          >
            cancelar envio
          </button>
        </p>
      ))}
      <button type="button" className="btn-outline" onClick={enviar} disabled={loading}>
        <Wrench size={15} strokeWidth={1.75} />
        Enviar para ajustes
      </button>
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
