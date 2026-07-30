import test from "node:test";
import assert from "node:assert/strict";
import { normalizarParcelasEntrada, formatarDataBR } from "./financeiro.js";

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
