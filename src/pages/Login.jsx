import { useState } from "react";
import { useAuth } from "../lib/AuthContext";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) setError("E-mail ou senha inválidos.");
  }

  return (
    <div className="login-page">
      <div className="login-brand-panel">
        <img src="/logo.png" alt="" className="login-brand-logo" />
        <p className="login-brand-nome wordmark">
          Instituto Odontológico Dr. Pablo Santos
        </p>
      </div>

      <div className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <p className="subtitle">Controle de pacientes</p>

          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
