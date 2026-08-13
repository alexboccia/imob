import type { PropertyInterestStage, PropertyStatus } from "@/generated/prisma/client";

// Fase G do CRM — próxima ação comercial derivada de um PropertyInterest
// já existente. Puramente uma orientação exibida ao corretor (Fase G,
// escopo mínimo aprovado): não é agendamento persistido, não cria
// Interaction, não tem data/hora. Função pura — mesmo espírito de
// calcularCompatibilidade (src/lib/property-matching.ts): sem Prisma, sem
// auth, sem fetch, sem process.env, sem I/O, sem side effects. Reusada
// nos mesmos 3 lugares que hoje mostram PropertyInterestStage (ficha do
// cliente, ficha do imóvel, cards de matching das Fases E/F) — nunca
// reimplementada.

export type ProximaAcaoComercialKey =
  | "AGENDAR_VISITA"
  | "REALIZAR_VISITA"
  | "REGISTRAR_RETORNO"
  | "ACOMPANHAR_PROPOSTA"
  | "ENCERRADO"
  | "INDISPONIVEL";

export type ProximaAcaoComercial = {
  key: ProximaAcaoComercialKey;
  label: string;
  // false para ENCERRADO/INDISPONIVEL — controla apresentação (ex: texto
  // apagado em vez de badge de destaque) sem a UI precisar reimplementar
  // a lógica de "isso ainda está em jogo?".
  ativa: boolean;
};

const ACAO_POR_STAGE: Record<
  Exclude<PropertyInterestStage, "REJECTED" | "WON">,
  ProximaAcaoComercial
> = {
  INTERESTED: { key: "AGENDAR_VISITA", label: "Agendar visita", ativa: true },
  VISIT_SCHEDULED: { key: "REALIZAR_VISITA", label: "Realizar visita", ativa: true },
  VISITED: { key: "REGISTRAR_RETORNO", label: "Registrar retorno", ativa: true },
  PROPOSAL: { key: "ACOMPANHAR_PROPOSTA", label: "Acompanhar proposta", ativa: true },
};

const ENCERRADO: ProximaAcaoComercial = { key: "ENCERRADO", label: "Encerrado", ativa: false };
const INDISPONIVEL: ProximaAcaoComercial = {
  key: "INDISPONIVEL",
  label: "Imóvel indisponível",
  ativa: false,
};

// REJECTED e WON (Fase P.2) têm precedência sobre Property.status — um
// relacionamento encerrado (perdido ou ganho) continua encerrado, não
// importa o que aconteça com o imóvel. Pra qualquer outro stage,
// propertyStatus !== AVAILABLE vira INDISPONIVEL — deliberadamente SEM
// tentar inferir se um Property RESERVED/SOLD/etc. foi causado por ESTE
// relacionamento especificamente: o modelo atual (Deal/PropertyStatusHistory)
// não tem nenhum vínculo com PropertyInterest que permita essa inferência
// com segurança (decisão registrada na auditoria da Fase G, reconfirmada na
// P.1, não decidida silenciosamente aqui).
export function obterProximaAcaoComercial(
  stage: PropertyInterestStage,
  propertyStatus: PropertyStatus
): ProximaAcaoComercial {
  if (stage === "REJECTED" || stage === "WON") return ENCERRADO;
  if (propertyStatus !== "AVAILABLE") return INDISPONIVEL;
  return ACAO_POR_STAGE[stage];
}
