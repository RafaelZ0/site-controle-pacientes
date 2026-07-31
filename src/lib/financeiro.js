export function normalizarParcelasEntrada(modalidade, quantidade) {
  return {
    modalidade: modalidade === "avista" ? "avista" : "parcelado",
    quantidade: modalidade === "avista" ? 1 : Math.max(0, Number(quantidade) || 0),
  };
}

export function formatarDataBR(isoDate) {
  const [ano, mes, dia] = isoDate.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function calcularProgressoPagamento({ etapasRegistradas, totalEtapas, parcelasPagas, totalParcelas }) {
  const percentProcedimento = (etapasRegistradas / totalEtapas) * 100;
  const percentPago = totalParcelas > 0 ? (parcelasPagas / totalParcelas) * 100 : 0;
  const esperado = percentProcedimento * 0.8;
  const diferenca = percentPago - esperado;
  const cor = diferenca > 15 ? "info" : diferenca < -15 ? "alerta" : "neutro";
  return { percentProcedimento, percentPago, esperado, diferenca, cor };
}
