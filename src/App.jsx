import { useState } from "react";
import { useAuth } from "./lib/AuthContext";
import Login from "./pages/Login";
import Busca from "./pages/Busca";
import PacienteForm from "./pages/PacienteForm";
import PacienteEditar from "./pages/PacienteEditar";

const IconPacientes = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <line x1="8" y1="8" x2="16" y2="8" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="8" y1="16" x2="13" y2="16" />
  </svg>
);

const IconNovo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const IconMenu = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </svg>
);

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

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuAberto ? "menu-aberto" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand wordmark">
            Instituto Odontológico Dr. Pablo Santos
          </div>
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setMenuAberto((v) => !v)}
            aria-label="Abrir menu"
          >
            <IconMenu />
          </button>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={view.name === "busca" || view.name === "editar" ? "ativo" : ""}
            onClick={irParaBusca}
          >
            <IconPacientes />
            Pacientes
          </button>
          <button
            type="button"
            className={view.name === "novo" ? "ativo" : ""}
            onClick={irParaNovo}
          >
            <IconNovo />
            Novo paciente
          </button>
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-footer-email">{session.user.email}</span>
          <button type="button" onClick={signOut}>
            Sair
          </button>
        </div>
      </aside>

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
      </main>
    </div>
  );
}
