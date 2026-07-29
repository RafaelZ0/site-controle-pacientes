import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useWorkspace } from "../lib/WorkspaceContext";

function mensagemErro(error) {
  if (!error) return null;
  if (error.code === "23505") {
    return "Já existe um serviço com esse nome.";
  }
  return error.message ?? "Erro desconhecido.";
}

export default function Servicos() {
  const { workspace } = useWorkspace();
  const [servicos, setServicos] = useState([]);
  const [error, setError] = useState(null);

  const [mostrarAdicionar, setMostrarAdicionar] = useState(false);
  const [servicoEditando, setServicoEditando] = useState(null); // servico | null

  async function carregar() {
    const { data, error } = await supabase
      .from("servicos")
      .select("*")
      .eq("workspace", workspace)
      .order("nome");
    if (error) setError(error.message);
    else setServicos(data);
  }

  useEffect(() => {
    carregar();
  }, [workspace]);

  return (
    <div className="dentistas-page">
      <h2>Serviços</h2>

      <button type="button" className="dentistas-adicionar-btn" onClick={() => setMostrarAdicionar(true)}>
        <Plus size={16} strokeWidth={2} />
        Adicionar serviço
      </button>

      {error && <p className="error">{error}</p>}

      <div className="pacientes-table-wrap dentistas-tabela-wrap">
        <table className="pacientes-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Nº mínimo de consultas</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {servicos.map((s) => (
              <tr key={s.id}>
                <td>{s.nome}</td>
                <td>{s.num_consultas_padrao > 0 ? s.num_consultas_padrao : "Não definido"}</td>
                <td>
                  <span className={`badge ${s.ativo ? "badge-adimplente" : "badge-neutro"}`}>
                    {s.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td>
                  <button type="button" className="btn-outline" onClick={() => setServicoEditando(s)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {servicos.length === 0 && (
              <tr>
                <td colSpan={4} className="estado-vazio">
                  <div className="estado-vazio-conteudo">
                    <span>Nenhum serviço cadastrado.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="dentistas-nota">
        Desativar não apaga nada — o serviço só some das opções ao cadastrar
        um tratamento novo; tratamentos já ligados a ele continuam
        normalmente. O nº mínimo de consultas é usado como valor inicial ao
        escolher esse serviço num tratamento novo (pode ser aumentado depois,
        nunca diminuído).
      </p>

      {mostrarAdicionar && (
        <AdicionarServicoModal
          onClose={() => setMostrarAdicionar(false)}
          onCriado={() => {
            setMostrarAdicionar(false);
            carregar();
          }}
        />
      )}

      {servicoEditando && (
        <EditarServicoModal
          servico={servicoEditando}
          onClose={() => setServicoEditando(null)}
          onEditado={() => {
            setServicoEditando(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function AdicionarServicoModal({ onClose, onCriado }) {
  const { workspace } = useWorkspace();
  const [nome, setNome] = useState("");
  const [numConsultasPadrao, setNumConsultasPadrao] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase
      .from("servicos")
      .insert({
        nome: nome.trim(),
        workspace,
        num_consultas_padrao: Number(numConsultasPadrao) || 0,
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
        <h2>Adicionar serviço</h2>

        <label>
          Nome
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Implante"
            required
            autoFocus
          />
        </label>

        <label>
          Nº mínimo de consultas
          <input
            type="number"
            min="0"
            value={numConsultasPadrao}
            onChange={(e) => setNumConsultasPadrao(e.target.value)}
          />
          <span className="label-ajuda">
            Ainda não sabe? Deixe 0 — fica "não definido" até você decidir.
          </span>
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

function EditarServicoModal({ servico, onClose, onEditado }) {
  const [nome, setNome] = useState(servico.nome);
  const [ativo, setAtivo] = useState(servico.ativo);
  const [numConsultasPadrao, setNumConsultasPadrao] = useState(String(servico.num_consultas_padrao ?? 0));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase
      .from("servicos")
      .update({
        nome: nome.trim(),
        ativo,
        num_consultas_padrao: Number(numConsultasPadrao) || 0,
      })
      .eq("id", servico.id);
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
        <h2>Editar serviço</h2>

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

        <label>
          Nº mínimo de consultas
          <input
            type="number"
            min="0"
            value={numConsultasPadrao}
            onChange={(e) => setNumConsultasPadrao(e.target.value)}
          />
          <span className="label-ajuda">
            Só vale pra tratamentos novos — não muda o nº de consultas de
            tratamentos já em andamento.
          </span>
        </label>

        <label className="checkbox-linha">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Ativo (aparece nas opções ao cadastrar um tratamento)
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
