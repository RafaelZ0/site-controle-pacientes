import { useState } from "react";
import { Users, UserPlus, Stethoscope, Menu } from "lucide-react";
import { useAuth } from "./lib/AuthContext";
import Login from "./pages/Login";
import Busca from "./pages/Busca";
import PacienteForm from "./pages/PacienteForm";
import PacienteEditar from "./pages/PacienteEditar";
import Dentistas from "./pages/Dentistas";

export default function App() {
  const { session, loading, signOut } = useAuth();
  const [view, setView] = useState({ name: "busca" });
  const [menuAberto, setMenuAberto] = useState(false);

  if (loading) return <p className="carregando">Carregando...</p>;
  if (!session) return <Login />;

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
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-footer-email">{session.user.email}</span>
        <button
          type="button"
          onClick={() => {
            setMenuAberto(false);
            signOut();
          }}
        >
          Sair
        </button>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img src="/logo.png" alt="" className="sidebar-logo" />
            <span className="wordmark">Instituto Odontológico Dr. Pablo Santos</span>
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
      </main>
    </div>
  );
}
