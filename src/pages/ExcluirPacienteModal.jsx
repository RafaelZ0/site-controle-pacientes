import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function ExcluirPacienteModal({ pacienteId, pacienteNome, onClose, onDeleted }) {
  const [confirmNome, setConfirmNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const nomeConfere =
    confirmNome.trim().toLowerCase() === (pacienteNome ?? "").trim().toLowerCase();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!nomeConfere) return;

    setError(null);
    setLoading(true);

    const { error } = await supabase.from("pacientes").delete().eq("id", pacienteId);

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    onDeleted?.();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2>Excluir paciente</h2>

        <p className="modal-aviso">
          Isso vai excluir <strong>{pacienteNome}</strong> permanentemente,
          junto com todas as consultas, parcelas e o histórico de etapas
          desse paciente. Essa ação não pode ser desfeita.
        </p>

        <label>
          Digite o nome do paciente para confirmar
          <input
            type="text"
            value={confirmNome}
            onChange={(e) => setConfirmNome(e.target.value)}
            placeholder={pacienteNome}
            autoFocus
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button
            type="submit"
            className="btn-danger"
            disabled={!nomeConfere || loading}
          >
            {loading ? "Excluindo..." : "Excluir permanentemente"}
          </button>
          <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
