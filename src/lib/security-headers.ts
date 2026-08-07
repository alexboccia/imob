// Cabeçalhos de segurança + CSP — usado por next.config.ts via
// `headers()`. Isolado num módulo próprio (em vez de inline no config)
// pra poder ser testado/lido separadamente do resto da config do Next.
//
// Mapa de domínio externo → por quê (todos os que o navegador realmente
// carrega hoje; Resend e Neon ficam de fora de propósito — server-only,
// nunca requisitados pelo navegador):
//   - R2 (R2_PUBLIC_URL)         → img-src: fotos/vídeos/plantas dos imóveis
//   - unpkg.com                  → img-src: ícone do marcador do Leaflet
//   - *.tile.openstreetmap.org   → img-src: tiles do mapa (cadastro de imóvel)
//   - viacep.com.br              → connect-src: busca de endereço por CEP
//   - servicodados.ibge.gov.br   → connect-src: lista de municípios por UF
//   - *.sentry.io / *.ingest.*.sentry.io → connect-src: eventos de erro
//   - www.google.com             → frame-src: mapa embarcado na página do imóvel
//   - www.youtube.com, player.vimeo.com → frame-src: vídeo do imóvel (link de embed)

type ImagemHost = { protocol: "https"; hostname: string };

function hostR2(): ImagemHost | null {
  const url = process.env.R2_PUBLIC_URL;
  if (!url) return null;
  try {
    return { protocol: "https", hostname: new URL(url).hostname };
  } catch {
    return null;
  }
}

export const R2_IMAGE_HOST = hostR2();

function construirCsp(producao: boolean): string {
  const imgSrc = ["'self'", "data:", "blob:", "https://unpkg.com", "https://*.tile.openstreetmap.org"];
  if (R2_IMAGE_HOST) imgSrc.push(`https://${R2_IMAGE_HOST.hostname}`);

  const diretivas: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline' aqui é uma concessão deliberada, testada, não um
    // descuido: sem nonce (que exigiria renderização dinâmica em todas as
    // páginas — incompatível com as páginas hoje estáticas, ver README) o
    // próprio Next.js injeta script inline pro streaming/hidratação do
    // RSC. Testei removendo 'unsafe-inline' (ver README, seção Headers de
    // segurança): a hidratação quebra de verdade — "Executing inline
    // script violates..." em toda página. Próximo passo de endurecimento
    // seria nonce via proxy.ts, não feito aqui (força dynamic rendering
    // em tudo). 'unsafe-eval' só fora de produção — modo dev do React usa
    // eval() pra reconstruir stack trace; nunca em produção.
    "script-src": producao ? ["'self'", "'unsafe-inline'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    // Mesma lógica, mais inevitável ainda: `style={{...}}` (React inline
    // style attribute) aparece em vários componentes com valor dinâmico
    // (ex: MapaLocalizacao, global-error.tsx) — não dá pra virar classe
    // CSS estática sem literalmente reescrever esses componentes, fora do
    // escopo desta fase.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": imgSrc,
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      "https://viacep.com.br",
      "https://servicodados.ibge.gov.br",
      "https://*.sentry.io",
      "https://*.ingest.sentry.io",
      "https://*.ingest.us.sentry.io",
      "https://*.ingest.de.sentry.io",
    ],
    "frame-src": ["https://www.google.com", "https://www.youtube.com", "https://player.vimeo.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // Defesa contra clickjacking — X-Frame-Options: DENY (abaixo) cobre o
    // mesmo caso pra navegadores que não leem frame-ancestors.
    "frame-ancestors": ["'none'"],
  };

  if (producao) diretivas["upgrade-insecure-requests"] = [];

  return Object.entries(diretivas)
    .map(([nome, valores]) => (valores.length > 0 ? `${nome} ${valores.join(" ")}` : nome))
    .join("; ");
}

export function construirHeadersSeguranca(): { key: string; value: string }[] {
  const producao = process.env.NODE_ENV === "production";

  const headers: { key: string; value: string }[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "gyroscope=()",
        "magnetometer=()",
        "accelerometer=()",
        "interest-cohort=()",
      ].join(", "),
    },
    // Ver comentário de frame-ancestors acima — os dois juntos, não um ou
    // outro, pra cobrir tanto navegador antigo quanto novo.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: construirCsp(producao) },
  ];

  // Só em produção com HTTPS de verdade — em dev (http://localhost) e no
  // build de teste do CI (NODE_ENV=test), HSTS forçaria HTTPS numa origem
  // que não tem certificado nenhum.
  if (producao) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}
