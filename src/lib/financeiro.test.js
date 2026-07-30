import test from "node:test";
import assert from "node:assert/strict";
import { normalizarParcelasEntrada } from "./financeiro.js";

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
