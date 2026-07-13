import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import PacienteForm from "./PacienteForm";
import HistoricoEtapas from "./HistoricoEtapas";
import ConsultasParcelas from "./ConsultasParcelas";

export default function PacienteEditar({ pacienteId, onSaved, onCancel }) {
  const [aba, setAba] = useState("cadastro");
  const [nome, setNome] = useState("");

  useEffect(() => {
    supabase
      .from("pacientes")
      .select("nome_completo")
      .eq("id", pacienteId)
      .single()
      .then(({ data }) => setNome(data?.nome_completo ?? ""));
  }, [pacienteId]);

  return (
    <div className="paciente-editar">
      <h2>{nome || "Editar paciente"}</h2>

      <div className="tabs">
        <button
          type="button"
          className={aba === "cadastro" ? "ativo" : ""}
          onClick={() => setAba("cadastro")}
        >
          Dados cadastrais
        </button>
        <button
          type="button"
          className={aba === "status" ? "ativo" : ""}
          onClick={() => setAba("status")}
        >
          Status do tratamento
        </button>
      </div>

      {aba === "cadastro" && (
        <PacienteForm pacienteId={pacienteId} onSaved={onSaved} onCancel={onCancel} />
      )}

      {aba === "status" && (
        <div className="paciente-status">
          <HistoricoEtapas pacienteId={pacienteId} />
          <ConsultasParcelas pacienteId={pacienteId} />
        </div>
      )}
    </div>
  );
}
