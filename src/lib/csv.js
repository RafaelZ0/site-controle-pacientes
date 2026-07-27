function escaparCampo(valor) {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  if (/["\n\r,]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function paraCsv(linhas, colunas) {
  const cabecalho = colunas.map((c) => escaparCampo(c.label)).join(",");
  const corpo = linhas.map((linha) =>
    colunas.map((c) => escaparCampo(c.valor(linha))).join(",")
  );
  return [cabecalho, ...corpo].join("\r\n");
}

const BOM_UTF8 = String.fromCharCode(0xfeff);

// BOM UTF-8 no início, senão o Excel abre acentuação (ã, ç...) corrompida.
export function baixarCsv(nomeArquivo, conteudo) {
  const blob = new Blob([BOM_UTF8 + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
