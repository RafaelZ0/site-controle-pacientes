import { Building2, GraduationCap } from "lucide-react";
import { useWorkspace } from "../lib/WorkspaceContext";

export default function WorkspacePicker() {
  const { setWorkspace } = useWorkspace();

  return (
    <div className="modal-overlay">
      <div className="modal-card workspace-picker-modal">
        <h2>Qual gestão você quer abrir?</h2>

        <div className="workspace-picker-opcoes">
          <button
            type="button"
            className="workspace-picker-opcao"
            onClick={() => setWorkspace("clinica")}
          >
            <Building2 size={26} strokeWidth={1.5} />
            Gestão de Pacientes da Clínica
          </button>

          <button
            type="button"
            className="workspace-picker-opcao"
            onClick={() => setWorkspace("curso")}
          >
            <GraduationCap size={26} strokeWidth={1.5} />
            Gestão de Pacientes do Curso
          </button>
        </div>
      </div>
    </div>
  );
}
