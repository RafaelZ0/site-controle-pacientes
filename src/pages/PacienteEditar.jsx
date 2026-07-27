import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { iniciais } from "../lib/avatar";
import PacienteForm from "./PacienteForm";
import HistoricoEtapas from "./HistoricoEtapas";
import ConsultasParcelas from "./ConsultasParcelas";
import EnviarAjusteAction from "./EnviarAjusteAction";

export default function PacienteEditar({ pacienteId, onSaved, onCancel }) {
  const [aba, setAba] = useState("status");
  const [nome, setNome] = useState("");
  const [configuracaoPendente, setConfiguracaoPendente] = useState(false);

  useEffect(() => {
    supabase
      .from("pacientes_status")
      .select("nome_completo, configuracao_pendente")
      .eq("id", pacienteId)
      .single()
      .then(({ data }) => {
        setNome(data?.nome_completo ?? "");
        setConfiguracaoPendente(Boolean(data?.configuracao_pendente));
      });
  }, [pacienteId]);

  return (
    <div className="paciente-editar">
      <div className="paciente-editar-header">
        {nome && <span className="avatar avatar-lg">{iniciais(nome)}</span>}
        <h2>{nome || "Editar paciente"}</h2>
      </div>

      {configuracaoPendente && (
        <p className="aviso-config-pendente">
          Configuração pendente — defina o nº de parcelas e de consultas na
          aba "Dados cadastrais" pra gerar o plano de consultas/parcelas
          deste paciente.
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
          className={aba === "cadastro" ? "ativo" : ""}
          onClick={() => setAba("cadastro")}
        >
          Dados cadastrais
        </button>
      </div>

      {aba === "cadastro" && (
        <PacienteForm pacienteId={pacienteId} onSaved={onSaved} onCancel={onCancel} />
      )}

      {aba === "status" && (
        <div className="paciente-status">
          <EnviarAjusteAction pacienteId={pacienteId} />
          <HistoricoEtapas pacienteId={pacienteId} />
          <ConsultasParcelas pacienteId={pacienteId} />
        </div>
      )}
    </div>
  );
}
