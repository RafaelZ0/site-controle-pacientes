import { Building2, GraduationCap } from "lucide-react";
import { useWorkspace } from "../lib/WorkspaceContext";

export default function WorkspacePicker() {
  const { setWorkspace } = useWorkspace();

  return (
    <div className="workspace-picker-page">
      <div className="workspace-picker-cartoes">
        <button
          type="button"
          className="workspace-picker-cartao"
          onClick={() => setWorkspace("clinica")}
        >
          <Building2 size={32} strokeWidth={1.5} />
          <span>Gestão de Pacientes da Clínica</span>
        </button>

        <button
          type="button"
          className="workspace-picker-cartao"
          onClick={() => setWorkspace("curso")}
        >
          <GraduationCap size={32} strokeWidth={1.5} />
          <span>Gestão de Pacientes do Curso</span>
        </button>
      </div>
    </div>
  );
}
