// Palavras reservadas do sistema — nunca podem colidir com um segmento de
// rota real. Extraído de src/app/platform/organizations/nova/actions.ts
// (Fase P.10) pra ser reutilizável também por
// src/lib/platform/hostname.ts (hostnameReservado): um slug reservado
// nunca pode virar "<slug>.{PUBLIC_ORG_SUBDOMAIN_BASE}" por consistência
// — mesma lista, um único lugar.
// AUDITORIA DA ÁRVORE DE ROTAS (Fase 26) — feita lendo src/app/, não
// copiada de convenção. Um slug só precisa ser reservado quando existe
// um caminho de PRIMEIRO NÍVEL capaz de sombrear /{orgSlug}:
//
//   api, app, cadastro, platform  -> diretórios estáticos reais. Segmento
//                                    estático vence o dinâmico no
//                                    roteador, então a organização
//                                    ficaria inacessível pelo próprio
//                                    endereço. RESERVADOS.
//   imoveis, contato, anuncie,
//   vendidos                      -> não são diretórios de topo, mas os
//                                    rewrites de next.config.ts mapeiam
//                                    /imoveis, /contato, /anuncie e
//                                    /vendidos para a organização padrão.
//                                    O efeito é o mesmo. RESERVADOS.
//   favicon.ico, robots.txt,
//   sitemap.xml                   -> têm extensão, e o normalizador de
//                                    slug transforma "." em hífen: nenhum
//                                    slug consegue produzi-los. NÃO
//                                    precisam de reserva.
//   _next, admin, www, convite    -> mantidos por serem compartilhados
//                                    com hostnameReservado (subdomínios),
//                                    onde a semântica é outra.
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
  // Toda família de rota pública precisa estar aqui: o rewrite da
  // organização principal vence a rota dinâmica [orgSlug], então uma
  // organização com um destes slugs perderia os próprios caminhos. Isto
  // não é mais mantido de memória — rotas-publicas.test.ts falha se uma
  // rota nova aparecer em src/app/[orgSlug]/ sem entrar nesta lista.
  // "corretores" entrou justamente assim: a rota foi criada na fase
  // anterior e ninguém lembrou daqui.
  "corretores",
  // Fase 26 — /cadastro é uma rota REAL de topo (o self-service). Um
  // segmento estático vence o dinâmico [orgSlug] no roteador, então uma
  // organização com este slug ficaria permanentemente inacessível pelo
  // próprio endereço.
  "cadastro",
]);
