import { createContext, useContext, useState } from "react";

const WorkspaceContext = createContext(null);

const CHAVE_STORAGE = "workspace";

export const NOME_WORKSPACE = { clinica: "Clínica", curso: "Curso" };
export const OUTRO_WORKSPACE = { clinica: "curso", curso: "clinica" };

export function WorkspaceProvider({ children }) {
  const [workspace, setWorkspaceState] = useState(() => {
    const salvo = localStorage.getItem(CHAVE_STORAGE);
    return salvo === "clinica" || salvo === "curso" ? salvo : null;
  });

  function setWorkspace(valor) {
    if (valor) localStorage.setItem(CHAVE_STORAGE, valor);
    else localStorage.removeItem(CHAVE_STORAGE);
    setWorkspaceState(valor);
  }

  return (
    <WorkspaceContext.Provider value={{ workspace, setWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace precisa estar dentro de WorkspaceProvider");
  return ctx;
}
