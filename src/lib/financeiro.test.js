import test from "node:test";
import assert from "node:assert/strict";
import { normalizarParcelasEntrada, formatarDataBR, calcularProgressoPagamento } from "./financeiro.js";

test("entrada à vista sempre gera uma única parcela", () => {
  assert.deepEqual(normalizarParcelasEntrada("avista", 8), {
    modalidade: "avista",
    quantidade: 1,
  });
});

test("entrada parcelada respeita a quantidade informada", () => {
  assert.deepEqual(normalizarParcelasEntrada("parcelado", 3), {
    modalidade: "parcelado",
    quantidade: 3,
  });
});

test("formatarDataBR converte data ISO para DD/MM/AAAA", () => {
  assert.equal(formatarDataBR("2027-08-05"), "05/08/2027");
});

test("calcularProgressoPagamento: pagamento dentro do esperado é neutro", () => {
  const r = calcularProgressoPagamento({ etapasRegistradas: 5, totalEtapas: 10, parcelasPagas: 4, totalParcelas: 10 });
  assert.equal(r.percentProcedimento, 50);
  assert.equal(r.percentPago, 40);
  assert.equal(r.esperado, 40);
  assert.equal(r.diferenca, 0);
  assert.equal(r.cor, "neutro");
});

test("calcularProgressoPagamento: pagando mais rápido que o esperado é info", () => {
  const r = calcularProgressoPagamento({ etapasRegistradas: 5, totalEtapas: 10, parcelasPagas: 6, totalParcelas: 10 });
  assert.equal(r.percentPago, 60);
  assert.equal(r.esperado, 40);
  assert.equal(r.diferenca, 20);
  assert.equal(r.cor, "info");
});

test("calcularProgressoPagamento: pagamento atrasado é alerta", () => {
  const r = calcularProgressoPagamento({ etapasRegistradas: 5, totalEtapas: 10, parcelasPagas: 2, totalParcelas: 10 });
  assert.equal(r.percentPago, 20);
  assert.equal(r.esperado, 40);
  assert.equal(r.diferenca, -20);
  assert.equal(r.cor, "alerta");
});

test("calcularProgressoPagamento: sem parcelas geradas não divide por zero", () => {
  const r = calcularProgressoPagamento({ etapasRegistradas: 3, totalEtapas: 10, parcelasPagas: 0, totalParcelas: 0 });
  assert.equal(r.percentPago, 0);
  assert.ok(Number.isFinite(r.diferenca));
});

test("calcularProgressoPagamento: diferenca exatamente +15 ainda é neutro (limite estrito)", () => {
  const r = calcularProgressoPagamento({ etapasRegistradas: 10, totalEtapas: 10, parcelasPagas: 95, totalParcelas: 100 });
  assert.equal(r.esperado, 80);
  assert.equal(r.percentPago, 95);
  assert.equal(r.diferenca, 15);
  assert.equal(r.cor, "neutro");
});

test("calcularProgressoPagamento: diferenca exatamente -15 ainda é neutro (limite estrito)", () => {
  const r = calcularProgressoPagamento({ etapasRegistradas: 10, totalEtapas: 10, parcelasPagas: 65, totalParcelas: 100 });
  assert.equal(r.esperado, 80);
  assert.equal(r.percentPago, 65);
  assert.equal(r.diferenca, -15);
  assert.equal(r.cor, "neutro");
});
