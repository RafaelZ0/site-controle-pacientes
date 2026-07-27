import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useWorkspace } from "../lib/WorkspaceContext";

const NOME_WORKSPACE = { clinica: "Clínica", curso: "Curso" };
const OUTRO_WORKSPACE = { clinica: "curso", curso: "clinica" };

export default function TransferirPacienteModal({
  pacienteId,
  pacienteNome,
  onClose,
  onTransferido,
}) {
  const { workspace } = useWorkspace();
  const destino = OUTRO_WORKSPACE[workspace];
  const [dentistas, setDentistas] = useState([]);
  const [dentistaId, setDentistaId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from("dentistas")
      .select("id, nome")
      .eq("ativo", true)
      .eq("workspace", destino)
      .order("nome")
      .then(({ data }) => setDentistas(data ?? []));
  }, [destino]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!dentistaId) return;

    setError(null);
    setLoading(true);

    const { error } = await supabase
      .from("pacientes")
      .update({ workspace: destino, dentista_id: dentistaId })
      .eq("id", pacienteId);

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    onTransferido?.();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Transferir paciente para {NOME_WORKSPACE[destino]}</h2>

        <p className="modal-aviso">
          <strong>{pacienteNome}</strong> vai passar a fazer parte da Gestão de
          Pacientes do {NOME_WORKSPACE[destino]}. Consultas, parcelas e o
          histórico de etapas continuam intactos — só o workspace e o
          dentista responsável mudam.
        </p>

        {dentistas.length > 0 ? (
          <label>
            Novo dentista responsável ({NOME_WORKSPACE[destino]})
            <select
              value={dentistaId}
              onChange={(e) => setDentistaId(e.target.value)}
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
        ) : (
          <p className="modal-aviso">
            Ainda não há nenhum dentista cadastrado em "{NOME_WORKSPACE[destino]}".
            Troque pra esse workspace e cadastre um na aba Dentistas antes de
            transferir.
          </p>
        )}

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button type="submit" disabled={!dentistaId || loading}>
            {loading ? "Transferindo..." : `Transferir para ${NOME_WORKSPACE[destino]}`}
          </button>
          <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
