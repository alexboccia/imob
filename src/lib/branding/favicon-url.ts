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
const EXTENSOES_IMAGEM = ["png", "jpg", "jpeg", "webp"] as const;

function padraoArquivo(extensoes: readonly string[]): RegExp {
  return new RegExp(
    `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${extensoes.join("|")})$`,
    "i"
  );
}

// Mesma checagem usada por validarFaviconUrl abaixo, generalizada pra
// qualquer asset de qualquer pasta de mídia do tenant (logo do
// cabeçalho, logo do rodapé, favicon — pasta "site"; imagem do Hero —
// pasta "hero") — usada também por quem precisa BUSCAR o arquivo no
// servidor (ver extrair-paleta-logo.ts), onde validar a URL antes de dar
// fetch nela é o que impede a geração automática de paleta virar um
// vetor de SSRF (o servidor só busca URLs comprovadamente dentro do
// próprio bucket R2, no prefixo da organização do chamador). `pasta`
// tem "site" como padrão — todo call site existente (favicon, logo do
// cabeçalho/rodapé) continua com o comportamento exato de antes.
//
// `extensoes` existe porque nem toda pasta guarda imagem: os materiais de
// apresentação do imóvel (pasta "materiais") são PDF. O padrão continua
// sendo o conjunto de imagem, então todo call site anterior segue
// idêntico.
export function validarUrlMidiaOrganizacao(
  url: string,
  organizationId: string,
  pasta: string = "site",
  extensoes: readonly string[] = EXTENSOES_IMAGEM
): boolean {
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
  const prefixoEsperado = `${prefixoBase}/${organizationId}/${pasta}/`;
  if (!mediaUrl.pathname.startsWith(prefixoEsperado)) return false;

  const resto = mediaUrl.pathname.slice(prefixoEsperado.length);
  return padraoArquivo(extensoes).test(resto);
}

export function validarFaviconUrl(url: string, organizationId: string): boolean {
  return validarUrlMidiaOrganizacao(url, organizationId);
}
