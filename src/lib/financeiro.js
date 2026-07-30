export function normalizarParcelasEntrada(modalidade, quantidade) {
  return {
    modalidade: modalidade === "avista" ? "avista" : "parcelado",
    quantidade: modalidade === "avista" ? 1 : Math.max(0, Number(quantidade) || 0),
  };
}
