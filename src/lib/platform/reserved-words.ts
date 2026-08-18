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
]);
