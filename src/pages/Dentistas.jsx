import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

function mensagemErro(error) {
  if (error?.code === "23505") {
    return "Já existe um dentista com esse nome.";
  }
  return error?.message ?? "Erro desconhecido.";
}

export default function Dentistas() {
  const [dentistas, setDentistas] = useState([]);
  const [novoNome, setNovoNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [nomeEditado, setNomeEditado] = useState("");

  async function carregar() {
    const { data, error } = await supabase.from("dentistas").select("*").order("nome");
    if (error) setError(error.message);
    else setDentistas(data);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function adicionar(e) {
    e.preventDefault();
    setError(null);
    if (!novoNome.trim()) return;

    setSalvando(true);
    const { error } = await supabase.from("dentistas").insert({ nome: novoNome.trim() });
    setSalvando(false);

    if (error) {
      setError(mensagemErro(error));
      return;
    }
    setNovoNome("");
    carregar();
  }

  async function alternarAtivo(dentista) {
    setError(null);
    const { error } = await supabase
      .from("dentistas")
      .update({ ativo: !dentista.ativo })
      .eq("id", dentista.id);
    if (error) setError(mensagemErro(error));
    else carregar();
  }

  function iniciarEdicao(dentista) {
    setEditandoId(dentista.id);
    setNomeEditado(dentista.nome);
  }

  async function salvarEdicao(id) {
    setError(null);
    if (!nomeEditado.trim()) return;
    const { error } = await supabase
      .from("dentistas")
      .update({ nome: nomeEditado.trim() })
      .eq("id", id);
    if (error) {
      setError(mensagemErro(error));
      return;
    }
    setEditandoId(null);
    carregar();
  }

  return (
    <div className="dentistas-page">
      <h2>Dentistas</h2>

      <form className="card dentistas-form" onSubmit={adicionar}>
        <label>
          Nome do novo dentista
          <input
            type="text"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Ex: Mariana Alves"
            required
          />
        </label>
        <button type="submit" disabled={salvando}>
          {salvando ? "Adicionando..." : "Adicionar"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="pacientes-table-wrap">
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
                <td>
                  {editandoId === d.id ? (
                    <input
                      type="text"
                      value={nomeEditado}
                      onChange={(e) => setNomeEditado(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    d.nome
                  )}
                </td>
                <td>
                  <span className={`badge ${d.ativo ? "badge-adimplente" : "badge-neutro"}`}>
                    {d.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="dentistas-acoes">
                  {editandoId === d.id ? (
                    <>
                      <button type="button" onClick={() => salvarEdicao(d.id)}>
                        Salvar
                      </button>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => setEditandoId(null)}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => iniciarEdicao(d)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => alternarAtivo(d)}
                      >
                        {d.ativo ? "Desativar" : "Ativar"}
                      </button>
                    </>
                  )}
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
        Desativar um dentista não apaga nada — ele só some das opções de "dentista
        responsável" ao cadastrar um paciente novo. Pacientes já ligados a ele continuam
        normalmente. Isso não cria nem remove o login de acesso ao site — isso continua
        sendo feito no painel do Supabase (Authentication → Users).
      </p>
    </div>
  );
}
