export const ETAPAS = [
  "AVALIAÇÃO",
  "EM TRATAMENTO",
  "IMPLANTE",
  "PROVISÓRIO",
  "REABERTURA",
  "MOLDAGEM",
  "PROVA",
  "ENTREGA",
  "AJUSTES",
  "FINALIZADO",
];

// Agrupa as 10 etapas em 4 cores pra dar de bater o olho numa lista e saber
// em que fase geral o paciente está, sem precisar ler o texto de cada badge.
const ETAPA_GRUPO = {
  "AVALIAÇÃO": "badge-etapa-inicial",
  "EM TRATAMENTO": "badge-etapa-andamento",
  IMPLANTE: "badge-etapa-andamento",
  PROVISÓRIO: "badge-etapa-andamento",
  MOLDAGEM: "badge-etapa-andamento",
  PROVA: "badge-etapa-andamento",
  ENTREGA: "badge-etapa-andamento",
  REABERTURA: "badge-etapa-atencao",
  AJUSTES: "badge-etapa-atencao",
  FINALIZADO: "badge-etapa-concluido",
};

export function etapaBadgeClasse(etapa) {
  return ETAPA_GRUPO[etapa] ?? "badge-neutro";
}

// Especialidade do dentista — só usado no Curso (alunos de
// pós-graduação), pra não deixar montar dupla ortodontista+implantodontista.
export const ESPECIALIDADES = ["ORTODONTIA", "IMPLANTODONTIA"];

const ESPECIALIDADE_LABEL = {
  ORTODONTIA: "Ortodontia",
  IMPLANTODONTIA: "Implantodontia",
};

export function formatarEspecialidades(especialidades) {
  if (!especialidades || especialidades.length === 0) return null;
  return especialidades.map((e) => ESPECIALIDADE_LABEL[e] ?? e).join(" + ");
}

export function especialidadesCompativeis(a, b) {
  if (!a?.length || !b?.length) return true;
  return a.some((e) => b.includes(e));
}
