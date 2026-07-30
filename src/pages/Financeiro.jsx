import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { normalizarParcelasEntrada, formatarDataBR } from "../lib/financeiro";

const TIPO_LABEL = { entrada: "Entrada", tratamento: "Tratamento" };
const LIMITE_PADRAO = 6;
const CAMPOS_CRITICOS = ["entrada_modalidade", "entrada_vencimento", "num_parcelas_entrada", "primeira_parcela_vencimento", "num_parcelas"];
const formInicial = { entrada_modalidade: "avista", entrada_vencimento: "", num_parcelas_entrada: "1", primeira_parcela_vencimento: "", num_parcelas: "" };

export default function Financeiro({ tratamentoId }) {
  const [form, setForm] = useState(formInicial);
  const [initialCriticos, setInitialCriticos] = useState(null);
  const [avisoRecalculo, setAvisoRecalculo] = useState(false);
  const [parcelas, setParcelas] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [verTodas, setVerTodas] = useState(false);

  async function carregar() {
    const [t, p] = await Promise.all([
      supabase.from("tratamentos").select("entrada_modalidade, entrada_vencimento, primeira_parcela_vencimento, num_parcelas_entrada, num_parcelas").eq("id", tratamentoId).single(),
      supabase.from("parcelas").select("*").eq("tratamento_id", tratamentoId).order("numero"),
    ]);
    if (t.error) setError(t.error.message);
    else {
      const carregado = {
        entrada_modalidade: t.data.entrada_modalidade ?? "avista",
        entrada_vencimento: t.data.entrada_vencimento ?? "",
        primeira_parcela_vencimento: t.data.primeira_parcela_vencimento ?? "",
        num_parcelas_entrada: String(t.data.num_parcelas_entrada ?? 0),
        num_parcelas: String(t.data.num_parcelas ?? 0),
      };
      setForm(carregado);
      setInitialCriticos(Object.fromEntries(CAMPOS_CRITICOS.map((c) => [c, carregado[c]])));
    }
    if (p.error) setError(p.error.message);
    else setParcelas(p.data ?? []);
  }

  useEffect(() => { carregar(); setAvisoRecalculo(false); }, [tratamentoId]);

  function updateField(field, value) { setForm((f) => ({ ...f, [field]: value })); setAvisoRecalculo(false); }
  function criticosMudaram() { return initialCriticos && CAMPOS_CRITICOS.some((campo) => String(form[campo] ?? "") !== String(initialCriticos[campo] ?? "")); }

  async function handleSubmit(e) {
    e.preventDefault(); setError(null); setInfo(null);
    if (!criticosMudaram()) return;
    if (!avisoRecalculo) return setAvisoRecalculo(true);
    const entrada = normalizarParcelasEntrada(form.entrada_modalidade, form.num_parcelas_entrada);
    setSalvando(true);
    const { error: updateError } = await supabase.from("tratamentos").update({
      entrada_modalidade: entrada.modalidade,
      entrada_vencimento: form.entrada_vencimento || null,
      num_parcelas_entrada: entrada.quantidade,
      primeira_parcela_vencimento: form.primeira_parcela_vencimento || null,
      num_parcelas: Math.max(0, Number(form.num_parcelas) || 0),
    }).eq("id", tratamentoId);
    if (updateError) { setSalvando(false); setError(updateError.message); return; }
    const { error: rpcError } = await supabase.rpc("recalcular_parcelas_tratamento", { p_tratamento_id: tratamentoId });
    setSalvando(false); setAvisoRecalculo(false);
    if (rpcError) return setError(rpcError.message);
    setInfo("Parcelas e vencimentos recalculados. Os pagamentos já marcados foram mantidos.");
    carregar();
  }

  async function toggleParcela(parcela) {
    const paga = !parcela.paga;
    const { error: updateError } = await supabase.from("parcelas").update({ paga, data_pagamento: paga ? todayISO() : null }).eq("id", parcela.id);
    if (updateError) setError(updateError.message); else carregar();
  }

  async function editarVencimento(parcela, data_vencimento) {
    if (!data_vencimento || data_vencimento === parcela.data_vencimento) return;
    setError(null);
    const { error: updateError } = await supabase.from("parcelas").update({ data_vencimento }).eq("id", parcela.id);
    if (updateError) setError(updateError.message); else setInfo("Vencimento atualizado.");
  }

  async function renegociarParcela(parcela) {
    setError(null); setInfo(null);
    const { error: rpcError } = await supabase.rpc("renegociar_parcela", { p_parcela_id: parcela.id });
    if (rpcError) { setError(rpcError.message); return; }
    const { data } = await supabase.from("parcelas").select("data_vencimento").eq("id", parcela.id).single();
    setInfo(`Parcela renegociada — novo vencimento: ${formatarDataBR(data.data_vencimento)}.`);
    carregar();
  }

  async function desfazerRenegociacao(parcela) {
    setError(null); setInfo(null);
    const { error: updateError } = await supabase.from("parcelas").update({ renegociada: false }).eq("id", parcela.id);
    if (updateError) { setError(updateError.message); return; }
    setInfo("Renegociação desfeita.");
    carregar();
  }

  const hoje = todayISO();
  const parcelasOrdenadas = [...parcelas].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "entrada" ? -1 : 1) || a.numero - b.numero);
  const parcelasVisiveis = verTodas ? parcelasOrdenadas : parcelasOrdenadas.slice(0, LIMITE_PADRAO);

  return <div className="financeiro">
    <h3>Financeiro</h3>
    <form className="paciente-form financeiro-form" onSubmit={handleSubmit}>
      <fieldset className="financeiro-grupo"><legend>Entrada</legend>
        <label>Forma de pagamento<select value={form.entrada_modalidade} onChange={(e) => updateField("entrada_modalidade", e.target.value)}><option value="avista">À vista</option><option value="parcelado">Parcelado</option></select></label>
        <label>Vencimento da entrada<input type="date" value={form.entrada_vencimento} onChange={(e) => updateField("entrada_vencimento", e.target.value)} /><span className="label-ajuda">Controle a entrada separadamente das parcelas do tratamento.</span></label>
        {form.entrada_modalidade === "parcelado" && <label>Nº de parcelas da entrada<input type="number" min="0" value={form.num_parcelas_entrada} onChange={(e) => updateField("num_parcelas_entrada", e.target.value)} required /></label>}
      </fieldset>
      <fieldset className="financeiro-grupo"><legend>Tratamento</legend>
        <label>1ª parcela do tratamento vence em<input type="date" value={form.primeira_parcela_vencimento} onChange={(e) => updateField("primeira_parcela_vencimento", e.target.value)} /></label>
        <label>Nº de parcelas do tratamento<input type="number" min="0" value={form.num_parcelas} onChange={(e) => updateField("num_parcelas", e.target.value)} required /><span className="label-ajuda">Deixe 0 enquanto a condição de pagamento ainda não estiver definida.</span></label>
      </fieldset>
      {error && <p className="error">{error}</p>}{info && <p className="info">{info}</p>}
      {avisoRecalculo && <div className="aviso-recalculo">Isso recalcula todos os vencimentos, inclusive os das parcelas pagas. As marcações de pagamento e suas datas serão preservadas.</div>}
      <div className="form-actions"><button type="submit" disabled={salvando}>{salvando ? "Salvando..." : avisoRecalculo ? "Confirmar e salvar" : "Salvar"}</button>{avisoRecalculo && <button type="button" className="btn-outline" onClick={() => setAvisoRecalculo(false)} disabled={salvando}>Voltar</button>}</div>
    </form>
    <table className="cp-table financeiro-tabela"><thead><tr><th>Tipo</th><th>#</th><th>Vencimento</th><th>Paga</th><th>Renegociação</th></tr></thead><tbody>
      {parcelasVisiveis.map((p) => <tr key={p.id} className={p.paga ? "cp-row-paga" : p.data_vencimento < hoje ? "cp-row-atrasada" : ""}><td>{TIPO_LABEL[p.tipo] ?? p.tipo}</td><td>{p.numero}</td><td><input className="vencimento-editavel" type="date" defaultValue={p.data_vencimento} onBlur={(e) => editarVencimento(p, e.target.value)} aria-label={`Vencimento da ${TIPO_LABEL[p.tipo]} ${p.numero}`} /></td><td><label className="check-touch"><input type="checkbox" checked={p.paga} onChange={() => toggleParcela(p)} /></label></td><td>{p.renegociada ? <><span className="badge badge-renegociada">Renegociada</span> <button type="button" className="link-botao" onClick={() => desfazerRenegociacao(p)}>Desfazer</button></> : !p.paga ? <button type="button" className="btn-outline" onClick={() => renegociarParcela(p)}>Renegociar</button> : null}</td></tr>)}
      {parcelas.length === 0 && <tr><td colSpan={5} className="estado-vazio"><div className="estado-vazio-conteudo"><span>Nenhuma parcela ainda — preencha o formulário acima.</span></div></td></tr>}
    </tbody></table>
    {parcelas.length > LIMITE_PADRAO && <button type="button" className="btn-outline ver-todas" onClick={() => setVerTodas((v) => !v)}>{verTodas ? "Mostrar menos" : `Ver todas as ${parcelas.length}`}</button>}
  </div>;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
