// Constantes do processamento de fotos de imóvel (Fase 120-B) — Perfil B
// ("Equilibrado"), aprovado em docs/tecnico/imagens/fase-120/10-DECISOES-PARA-APROVACAO.md
// (decisão 2). Mesmo padrão de hero-image-limits.ts: constantes puras,
// seguras de importar tanto do servidor quanto, se um dia precisar, de
// um componente client — a validação/processamento real sempre acontece
// no servidor (property-image-processar.ts).

// Largura máxima armazenada — qualquer tela atual, inclusive zoom
// moderado de galeria, exibe bem a partir disto; maior só desperdiça
// armazenamento/egress sem ganho visual perceptível.
export const IMOVEL_LARGURA_MAXIMA_ARMAZENADA = 2048;

// Mesmo valor já validado em produção pelo processamento do Hero
// institucional — não é um número novo, é o mesmo parâmetro reaproveitado.
export const IMOVEL_QUALIDADE_WEBP = 82;

// =======================================================================
// Gate de ativação — Fase 120 (deploy)
// =======================================================================
// A auditoria de publicação exigiu validação visual com fotografias
// REAIS de imóvel (sala, fachada, cozinha, banheiro, pouca luz, etc.)
// antes de liberar a compressão em produção — critério explicitamente
// bloqueante, não contornável por teste automatizado. Esta sessão não
// tinha nenhuma fotografia real autorizada disponível para essa
// validação (as únicas imagens locais de propriedade desconhecida,
// `public/demo-fotos/`, não têm proveniência/licença confirmada — nunca
// usadas como substituto de autorização real, mesma doutrina já seguida
// em fases comerciais anteriores sobre não usar foto de imóvel real sem
// autorização).
//
// Por isso o código é publicado, mas a ramificação de compressão
// permanece DESLIGADA por padrão — `PROPERTY_IMAGE_COMPRESSION_ENABLED`
// precisa ser definida explicitamente como "true" depois que a validação
// visual real for feita. Mesmo padrão já usado em legacy-reprocess.ts
// (`LEGACY_REPROCESS_ENABLED`) — comparação exata, qualquer outro valor
// é tratado como desligado.
export function compressaoDeImovelHabilitada(): boolean {
  return process.env.PROPERTY_IMAGE_COMPRESSION_ENABLED === "true";
}
