import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../supabaseClient";

function mensagemErro(error) {
  if (!error) return null;
  if (error.message?.toLowerCase().includes("incorreta")) {
    return "Senha de administrador incorreta.";
  }
  if (error.code === "23505") {
    return "Já existe um dentista com esse nome.";
  }
  return error.message ?? "Erro desconhecido.";
}

export default function Dentistas() {
  const [dentistas, setDentistas] = useState([]);
  const [error, setError] = useState(null);

  const [mostrarAdicionar, setMostrarAdicionar] = useState(false);
  const [dentistaEditando, setDentistaEditando] = useState(null); // dentista | null

  async function carregar() {
    const { data, error } = await supabase.from("dentistas").select("*").order("nome");
    if (error) setError(error.message);
    else setDentistas(data);
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="dentistas-page">
      <h2>Dentistas</h2>

      <button type="button" className="dentistas-adicionar-btn" onClick={() => setMostrarAdicionar(true)}>
        <Plus size={16} strokeWidth={2} />
        Adicionar dentista
      </button>

      {error && <p className="error">{error}</p>}

      <div className="pacientes-table-wrap dentistas-tabela-wrap">
        <table className="pacientes-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {dentistas.map((d) => (
              <tr key={d.id}>
                <td>{d.nome}</td>
                <td>
                  <span className={`badge ${d.ativo ? "badge-adimplente" : "badge-neutro"}`}>
                    {d.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td>
                  <button type="button" className="btn-outline" onClick={() => setDentistaEditando(d)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {dentistas.length === 0 && (
              <tr>
                <td colSpan={3} className="estado-vazio">
                  <div className="estado-vazio-conteudo">
                    <span>Nenhum dentista cadastrado.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="dentistas-nota">
        Criar ou editar um dentista exige a senha de administrador. Desativar não apaga
        nada — o dentista só some das opções de "dentista responsável" ao cadastrar um
        paciente novo; pacientes já ligados a ele continuam normalmente. Isso também não
        cria nem remove o login de acesso ao site — isso continua sendo feito no painel
        do Supabase (Authentication → Users).
      </p>

      {mostrarAdicionar && (
        <AdicionarDentistaModal
          onClose={() => setMostrarAdicionar(false)}
          onCriado={() => {
            setMostrarAdicionar(false);
            carregar();
          }}
        />
      )}

      {dentistaEditando && (
        <EditarDentistaModal
          dentista={dentistaEditando}
          onClose={() => setDentistaEditando(null)}
          onEditado={() => {
            setDentistaEditando(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function AdicionarDentistaModal({ onClose, onCriado }) {
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.rpc("criar_dentista_admin", {
      p_nome: nome.trim(),
      p_senha: senha,
    });
    setLoading(false);
    if (error) {
      setError(mensagemErro(error));
      return;
    }
    onCriado?.();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Adicionar dentista</h2>

        <label>
          Nome
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Mariana Alves"
            required
            autoFocus
          />
        </label>

        <label>
          Senha de administrador
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button type="submit" disabled={loading}>
            {loading ? "Adicionando..." : "Adicionar"}
          </button>
          <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function EditarDentistaModal({ dentista, onClose, onEditado }) {
  const [nome, setNome] = useState(dentista.nome);
  const [ativo, setAtivo] = useState(dentista.ativo);
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.rpc("editar_dentista_admin", {
      p_id: dentista.id,
      p_nome: nome.trim(),
      p_ativo: ativo,
      p_senha: senha,
    });
    setLoading(false);
    if (error) {
      setError(mensagemErro(error));
      return;
    }
    onEditado?.();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Editar dentista</h2>

        <label>
          Nome
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label className="checkbox-linha">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Ativo (aparece nas opções de dentista responsável)
        </label>

        <label>
          Senha de administrador
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Salvar"}
          </button>
          <button type="button" className="btn-outline" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
