import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./lib/AuthContext";
import { WorkspaceProvider } from "./lib/WorkspaceContext";
import ErrorBoundary from "./lib/ErrorBoundary";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <WorkspaceProvider>
          <App />
        </WorkspaceProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
