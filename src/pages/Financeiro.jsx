import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const TIPO_LABEL = { entrada: "Entrada", tratamento: "Tratamento" };
const LIMITE_PADRAO = 6;
const CAMPOS_CRITICOS = ["primeira_parcela_vencimento", "num_parcelas_entrada", "num_parcelas"];

const formInicial = {
  primeira_parcela_vencimento: "",
  num_parcelas_entrada: "",
  num_parcelas: "",
};

export default function Financeiro({ tratamentoId }) {
  const [form, setForm] = useState(formInicial);
  const [initialCriticos, setInitialCriticos] = useState(null);
  const [avisoRecalculo, setAvisoRecalculo] = useState(false);
  const [parcelas, setParcelas] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [verTodas, setVerTodas] = useState(false);

  async function carregar() {
    const [t, p] = await Promise.all([
      supabase
        .from("tratamentos")
        .select("primeira_parcela_vencimento, num_parcelas_entrada, num_parcelas")
        .eq("id", tratamentoId)
        .single(),
      supabase
        .from("parcelas")
        .select("*")
        .eq("tratamento_id", tratamentoId)
        .order("numero"),
    ]);

    if (t.error) {
      setError(t.error.message);
    } else {
      const carregado = {
        primeira_parcela_vencimento: t.data.primeira_parcela_vencimento ?? "",
        num_parcelas_entrada: t.data.num_parcelas_entrada,
        num_parcelas: t.data.num_parcelas,
      };
      setForm(carregado);
      setInitialCriticos(
        Object.fromEntries(CAMPOS_CRITICOS.map((c) => [c, carregado[c]]))
      );
    }

    if (p.error) setError(p.error.message);
    else setParcelas(p.data ?? []);
  }

  useEffect(() => {
    carregar();
    setAvisoRecalculo(false);
  }, [tratamentoId]);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (avisoRecalculo) setAvisoRecalculo(false);
  }

  function criticosMudaram() {
    if (!initialCriticos) return false;
    return CAMPOS_CRITICOS.some(
      (campo) => String(form[campo] ?? "") !== String(initialCriticos[campo] ?? "")
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!criticosMudaram()) return;

    if (!avisoRecalculo) {
      setAvisoRecalculo(true);
      return;
    }

    setSalvando(true);

    const { error } = await supabase
      .from("tratamentos")
      .update({
        primeira_parcela_vencimento: form.primeira_parcela_vencimento || null,
        num_parcelas_entrada: Number(form.num_parcelas_entrada),
        num_parcelas: Number(form.num_parcelas),
      })
      .eq("id", tratamentoId);

    if (error) {
      setSalvando(false);
      setError(error.message);
      return;
    }

    const { error: rpcError } = await supabase.rpc("recalcular_parcelas_tratamento", {
      p_tratamento_id: tratamentoId,
    });

    setSalvando(false);
    setAvisoRecalculo(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setInfo("Parcelas recalculadas com sucesso.");
    carregar();
  }

  async function handleRegenerar() {
    const parcelasPagas = parcelas.filter((p) => p.paga).length;
    const confirmado = window.confirm(
      `Isso vai apagar TODAS as parcelas deste tratamento e recriar do zero — inclusive ${parcelasPagas} já paga(s), que serão perdidas. Essa ação não pode ser desfeita. Continuar?`
    );
    if (!confirmado) return;

    setError(null);
    setInfo(null);
    setRegenerando(true);
    const { error } = await supabase.rpc("gerar_parcelas_tratamento", {
      p_tratamento_id: tratamentoId,
    });
    setRegenerando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInfo("Parcelas regeneradas do zero a partir dos dados atuais.");
    carregar();
  }

  async function toggleParcela(parcela) {
    const paga = !parcela.paga;
    const { error } = await supabase
      .from("parcelas")
      .update({ paga, data_pagamento: paga ? todayISO() : null })
      .eq("id", parcela.id);
    if (error) setError(error.message);
    else carregar();
  }

  const hoje = todayISO();
  const parcelasOrdenadas = [...parcelas].sort(
    (a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "entrada" ? -1 : 1) || a.numero - b.numero
  );
  const parcelasVisiveis = verTodas ? parcelasOrdenadas : parcelasOrdenadas.slice(0, LIMITE_PADRAO);

  return (
    <div className="financeiro">
      <h3>Financeiro</h3>

      <form className="paciente-form financeiro-form" onSubmit={handleSubmit}>
        <label>
          1ª parcela vence em
          <input
            type="date"
            value={form.primeira_parcela_vencimento}
            onChange={(e) => updateField("primeira_parcela_vencimento", e.target.value)}
            required
          />
          <span className="label-ajuda">
            As demais parcelas (entrada + tratamento) são calculadas em
            sequência mensal a partir dessa data.
          </span>
        </label>

        <label>
          Nº de parcelas da entrada
          <input
            type="number"
            min="0"
            value={form.num_parcelas_entrada}
            onChange={(e) => updateField("num_parcelas_entrada", e.target.value)}
            required
          />
          <span className="label-ajuda">
            Deixe 0 se o paciente não parcelou a entrada.
          </span>
        </label>

        <label>
          Nº de parcelas do tratamento
          <input
            type="number"
            min="0"
            value={form.num_parcelas}
            onChange={(e) => updateField("num_parcelas", e.target.value)}
            required
          />
          <span className="label-ajuda">
            Ainda não sabe? Deixe 0 — o tratamento fica marcado como
            "configuração pendente" até você definir.
          </span>
        </label>

        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}

        {avisoRecalculo && (
          <div className="aviso-recalculo">
            Isso vai recalcular os vencimentos das parcelas que ainda estão em
            aberto, a partir da última já paga. Nada que já foi marcado como
            pago será alterado.
          </div>
        )}

        <div className="form-actions">
          <button type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : avisoRecalculo ? "Confirmar e salvar" : "Salvar"}
          </button>
          {avisoRecalculo && (
            <button
              type="button"
              className="btn-outline"
              onClick={() => setAvisoRecalculo(false)}
              disabled={salvando}
            >
              Voltar
            </button>
          )}
        </div>
      </form>

      <table className="cp-table financeiro-tabela">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>#</th>
            <th>Vencimento</th>
            <th>Paga</th>
          </tr>
        </thead>
        <tbody>
          {parcelasVisiveis.map((p) => (
            <tr
              key={p.id}
              className={p.paga ? "cp-row-paga" : p.data_vencimento < hoje ? "cp-row-atrasada" : ""}
            >
              <td>{TIPO_LABEL[p.tipo] ?? p.tipo}</td>
              <td>{p.numero}</td>
              <td>{formatDate(p.data_vencimento)}</td>
              <td>
                <label className="check-touch">
                  <input type="checkbox" checked={p.paga} onChange={() => toggleParcela(p)} />
                </label>
              </td>
            </tr>
          ))}
          {parcelas.length === 0 && (
            <tr>
              <td colSpan={4} className="estado-vazio">
                <div className="estado-vazio-conteudo">
                  <span>Nenhuma parcela ainda — preencha o formulário acima.</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {parcelas.length > LIMITE_PADRAO && (
        <button type="button" className="btn-outline ver-todas" onClick={() => setVerTodas((v) => !v)}>
          {verTodas ? "Mostrar menos" : `Ver todas as ${parcelas.length}`}
        </button>
      )}

      {parcelas.length > 0 && (
        <div className="regenerar-plano">
          <p>
            Salvar o formulário acima já recalcula sozinho as parcelas em
            aberto — preservando o que já foi pago. Se em vez disso você
            quiser <strong>apagar e recriar as parcelas do zero</strong>
            (perde marcações de pago), use o botão abaixo.
          </p>
          <button
            type="button"
            className="btn-danger-outline"
            onClick={handleRegenerar}
            disabled={regenerando}
          >
            {regenerando ? "Regenerando..." : "Apagar e recriar parcelas do zero"}
          </button>
        </div>
      )}
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
