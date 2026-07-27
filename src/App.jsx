import { useState } from "react";
import { Users, UserPlus, Stethoscope, Wrench, Menu, ArrowLeftRight } from "lucide-react";
import { useAuth } from "./lib/AuthContext";
import { useWorkspace } from "./lib/WorkspaceContext";
import Login from "./pages/Login";
import WorkspacePicker from "./pages/WorkspacePicker";
import Busca from "./pages/Busca";
import PacienteForm from "./pages/PacienteForm";
import PacienteEditar from "./pages/PacienteEditar";
import Dentistas from "./pages/Dentistas";
import Ajustes from "./pages/Ajustes";

const NOME_WORKSPACE = { clinica: "Clínica", curso: "Curso" };
const OUTRO_WORKSPACE = { clinica: "curso", curso: "clinica" };
const WORDMARK_WORKSPACE = {
  clinica: "Instituto Odontológico Dr. Pablo Santos",
  curso: "Controle de Alunos Especialização - Instituto Dr. Pablo Santos",
};

export default function App() {
  const { session, loading, signOut } = useAuth();
  const { workspace, setWorkspace } = useWorkspace();
  const [view, setView] = useState({ name: "busca" });
  const [menuAberto, setMenuAberto] = useState(false);

  if (loading) return <p className="carregando">Carregando...</p>;
  if (!session) return <Login />;
  if (!workspace) return <WorkspacePicker />;

  function irParaBusca() {
    setView({ name: "busca" });
    setMenuAberto(false);
  }

  function irParaNovo() {
    setView({ name: "novo" });
    setMenuAberto(false);
  }

  function irParaDentistas() {
    setView({ name: "dentistas" });
    setMenuAberto(false);
  }

  function irParaAjustes() {
    setView({ name: "ajustes" });
    setMenuAberto(false);
  }

  function trocarWorkspace() {
    const destino = OUTRO_WORKSPACE[workspace];
    const confirmado = window.confirm(
      `Trocar para a Gestão de Pacientes do ${NOME_WORKSPACE[destino]}?`
    );
    if (!confirmado) return;
    setWorkspace(destino);
    window.location.reload();
  }

  const navItens = (
    <>
      <nav className="sidebar-nav">
        <button
          type="button"
          className={view.name === "busca" || view.name === "editar" ? "ativo" : ""}
          onClick={irParaBusca}
        >
          <Users size={18} strokeWidth={1.75} />
          Pacientes
        </button>
        <button
          type="button"
          className={view.name === "novo" ? "ativo" : ""}
          onClick={irParaNovo}
        >
          <UserPlus size={18} strokeWidth={1.75} />
          Novo paciente
        </button>
        <button
          type="button"
          className={view.name === "dentistas" ? "ativo" : ""}
          onClick={irParaDentistas}
        >
          <Stethoscope size={18} strokeWidth={1.75} />
          Dentistas
        </button>
        <button
          type="button"
          className={view.name === "ajustes" ? "ativo" : ""}
          onClick={irParaAjustes}
        >
          <Wrench size={18} strokeWidth={1.75} />
          Ajustes
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-workspace">
          <span>{NOME_WORKSPACE[workspace]}</span>
          <button type="button" className="link-botao-inverso" onClick={trocarWorkspace}>
            <ArrowLeftRight size={12} strokeWidth={2} />
            Trocar
          </button>
        </div>
        <span className="sidebar-footer-email">{session.user.email}</span>
        <button
          type="button"
          onClick={() => {
            setMenuAberto(false);
            setWorkspace(null);
            signOut();
          }}
        >
          Sair
        </button>
      </div>
    </>
  );

  return (
    <div className="app-shell" data-workspace={workspace}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img src="/logo.png" alt="" className="sidebar-logo" />
            <span className="wordmark">{WORDMARK_WORKSPACE[workspace]}</span>
          </div>
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setMenuAberto((v) => !v)}
            aria-label="Abrir menu"
          >
            <Menu size={20} strokeWidth={1.75} />
          </button>
        </div>

        {/* Desktop: nav e rodapé ficam dentro da própria sidebar fixa */}
        <div className="sidebar-conteudo-desktop">{navItens}</div>
      </aside>

      {menuAberto && (
        <div className="drawer-overlay" onClick={() => setMenuAberto(false)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            {navItens}
          </div>
        </div>
      )}

      <main className="app-main">
        {view.name === "busca" && (
          <Busca
            onEditPaciente={(id) => setView({ name: "editar", id })}
          />
        )}
        {view.name === "novo" && (
          <PacienteForm onSaved={irParaBusca} onCancel={irParaBusca} />
        )}
        {view.name === "editar" && (
          <PacienteEditar
            pacienteId={view.id}
            onSaved={irParaBusca}
            onCancel={irParaBusca}
          />
        )}
        {view.name === "dentistas" && <Dentistas />}
        {view.name === "ajustes" && (
          <Ajustes onEditPaciente={(id) => setView({ name: "editar", id })} />
        )}
      </main>
    </div>
  );
}
