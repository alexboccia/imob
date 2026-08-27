// Valida que uma URL de favicon aponta pro bucket público oficial da
// aplicação (R2_PUBLIC_URL) e pra um objeto dentro do prefixo da própria
// organização — mesmo formato de chave gerado pelo upload
// (src/app/api/admin/upload/route.ts: `${organizationId}/${pasta}/${uuid}.${ext}`,
// pasta "site" pro favicon/logo). Usado tanto ao salvar (configuracoes/
// actions.ts) quanto ao servir ([orgSlug]/icon.tsx, defesa em profundidade —
// nunca confia só na validação de quem gravou o dado).
//
// Comparação por `origin` via URL, não `startsWith` na string crua: evita
// falso positivo do tipo "https://pub-xxx.r2.dev.attacker.com/..." bater
// com um prefixo ingênuo "https://pub-xxx.r2.dev".
const PADRAO_ARQUIVO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$/i;

// Mesma checagem usada por validarFaviconUrl abaixo, generalizada pra
// qualquer asset da pasta "site" (logo do cabeçalho, logo do rodapé,
// favicon) — usada também por quem precisa BUSCAR o arquivo no servidor
// (ver extrair-paleta-logo.ts), onde validar a URL antes de dar fetch
// nela é o que impede a geração automática de paleta virar um vetor de
// SSRF (o servidor só busca URLs comprovadamente dentro do próprio bucket
// R2, no prefixo da organização do chamador).
export function validarUrlMidiaOrganizacao(url: string, organizationId: string): boolean {
  const publicUrlBruta = process.env.R2_PUBLIC_URL;
  if (!publicUrlBruta) return false;

  let r2PublicUrl: URL;
  let mediaUrl: URL;
  try {
    r2PublicUrl = new URL(publicUrlBruta);
    mediaUrl = new URL(url);
  } catch {
    return false;
  }

  if (mediaUrl.origin !== r2PublicUrl.origin) return false;

  const prefixoBase = r2PublicUrl.pathname.replace(/\/$/, "");
  const prefixoEsperado = `${prefixoBase}/${organizationId}/site/`;
  if (!mediaUrl.pathname.startsWith(prefixoEsperado)) return false;

  const resto = mediaUrl.pathname.slice(prefixoEsperado.length);
  return PADRAO_ARQUIVO.test(resto);
}

export function validarFaviconUrl(url: string, organizationId: string): boolean {
  return validarUrlMidiaOrganizacao(url, organizationId);
}
