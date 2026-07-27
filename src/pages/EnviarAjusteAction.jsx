import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { supabase } from "../supabaseClient";

export default function EnviarAjusteAction({ pacienteId }) {
  const [solicitacaoAberta, setSolicitacaoAberta] = useState(undefined); // undefined = carregando
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function carregar() {
    const { data, error } = await supabase
      .from("solicitacoes_ajuste")
      .select("id, criado_em")
      .eq("paciente_id", pacienteId)
      .eq("concluido", false)
      .maybeSingle();
    if (error) setError(error.message);
    else setSolicitacaoAberta(data ?? null);
  }

  useEffect(() => {
    setSolicitacaoAberta(undefined);
    carregar();
  }, [pacienteId]);

  async function enviar() {
    setError(null);
    setLoading(true);
    const { error } = await supabase
      .from("solicitacoes_ajuste")
      .insert({ paciente_id: pacienteId });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    carregar();
  }

  async function cancelar() {
    setError(null);
    setLoading(true);
    const { error } = await supabase
      .from("solicitacoes_ajuste")
      .delete()
      .eq("id", solicitacaoAberta.id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    carregar();
  }

  if (solicitacaoAberta === undefined) return null;

  return (
    <div className="ajuste-action">
      {solicitacaoAberta ? (
        <p className="ajuste-action-status">
          <Wrench size={15} strokeWidth={1.75} />
          Na fila de ajustes desde {formatDate(solicitacaoAberta.criado_em)} —{" "}
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
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function formatDate(value) {
  const data = new Date(value);
  return data.toLocaleDateString("pt-BR");
}
