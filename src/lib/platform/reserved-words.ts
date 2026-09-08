// Palavras reservadas do sistema — nunca podem colidir com um segmento de
// rota real. Extraído de src/app/platform/organizations/nova/actions.ts
// (Fase P.10) pra ser reutilizável também por
// src/lib/platform/hostname.ts (hostnameReservado): um slug reservado
// nunca pode virar "<slug>.{PUBLIC_ORG_SUBDOMAIN_BASE}" por consistência
// — mesma lista, um único lugar.
export const SLUGS_RESERVADOS = new Set([
  "app",
  "api",
  "platform",
  "_next",
  "admin",
  "convite",
  "www",
  "imoveis",
  "contato",
  "anuncie",
  "vendidos",
  // Fase 26 — /cadastro é uma rota REAL de topo (o self-service). Um
  // segmento estático vence o dinâmico [orgSlug] no roteador, então uma
  // organização com este slug ficaria permanentemente inacessível pelo
  // próprio endereço.
  "cadastro",
]);
