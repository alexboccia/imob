import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { buscarBranding } from "@/lib/branding";
import { resolverTemaEfetivo } from "@/lib/branding/temas";
import { getOrganizationBySlug } from "@/lib/tenant";
import { resolverBasePath } from "@/lib/site-url";
import { withOrganization } from "@/lib/tenant-context";
import { DESCRICAO_PADRAO_SITE } from "@/lib/site-config";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BotaoContatoFlutuante } from "@/components/BotaoContatoFlutuante";

// Sobrescreve o title/openGraph genéricos do layout raiz pro nome da
// organização — aplica-se a toda página pública que não define seu
// próprio title (herda o template) ou openGraph (herda por inteiro,
// já que openGraph não faz merge campo a campo entre segmentos).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) return {};

  // Fase P.10 — nome público (OrganizationBranding.displayName), com
  // fallback pro Organization.name atual quando não configurado. Sem
  // hardcode de nenhuma organização específica.
  const branding = await buscarBranding(organization.id);
  const nomePublico = branding.displayName ?? organization.name;

  return {
    title: {
      default: nomePublico,
      template: `%s | ${nomePublico}`,
    },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: nomePublico,
      title: nomePublico,
      description: DESCRICAO_PADRAO_SITE,
    },
    twitter: {
      card: "summary_large_image",
      title: nomePublico,
      description: DESCRICAO_PADRAO_SITE,
    },
    // Favicon por organização: NÃO dá pra usar o campo `icons` aqui —
    // favicon.ico na raiz de app/ tem prioridade absoluta sobre
    // generateMetadata (ver icon.tsx neste mesmo diretório, que resolve
    // isso via convenção de arquivo por segmento).
  };
}

// Sem force-dynamic global: o cabeçalho (nome/logo/whatsapp) usa
// buscarConfiguracaoContato, que já é cacheada por organização com
// invalidação explícita (updateTag) em salvarConfiguracaoContato —
// isso garante a mesma atualização imediata que o force-dynamic dava,
// sem forçar toda página pública (inclusive /contato, que não tem
// nenhum dado dinâmico próprio) a renderizar do zero em toda requisição.

// "Anuncie seu imóvel" entra no menu principal ao lado dos três de
// sempre: é a única rota pública do site que fala com quem TEM imóvel em
// vez de quem procura, e estava alcançável só por link direto. Aponta pra
// /[orgSlug]/anuncie, que já existe e funciona (AnuncieForm) — nenhum
// link novo é inventado aqui. O estado ativo funciona sozinho: o
// SiteHeader deriva de href + pathname, não de uma lista fixa.
function navLinks(basePath: string) {
  return [
    { href: `${basePath}/imoveis?finalidade=SALE`, label: "Comprar" },
    { href: `${basePath}/imoveis?finalidade=RENT`, label: "Alugar" },
    { href: `${basePath}/imoveis?lancamento=1`, label: "Lançamentos" },
    { href: `${basePath}/anuncie`, label: "Anuncie seu imóvel" },
  ];
}

// Este layout é gate de EXPERIÊNCIA (404 pra slug inexistente, página
// neutra pra organização suspensa), não fronteira de segurança — qualquer
// Server Action/Route Handler pode ser chamada diretamente sem passar por
// aqui, e por isso cada uma revalida a organização por conta própria. Ver
// plano, seção "Modelo de isolamento e fronteira de segurança".
export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) notFound();

  // Organização suspensa (pelo Super Admin, /platform): site público
  // mostra um estado neutro em vez do conteúdo normal — nenhum dado é
  // apagado, só a exibição/uso é bloqueado. 200 + noindex (não 503: não é
  // um problema de infra, é uma decisão administrativa que pode durar
  // indefinidamente; sustentado por dias, 503 tende a ser tratado como
  // remoção pelo Google de qualquer forma). Não revela o motivo da
  // suspensão — evitaria vazar informação comercial sensível do tenant
  // pra qualquer visitante.
  if (!organization.active) {
    return (
      <>
        <meta name="robots" content="noindex" />
        <main className="flex-1 flex items-center justify-center min-h-[60vh] px-4">
          <p className="text-center text-muted-foreground max-w-sm">
            Este site está temporariamente indisponível.
          </p>
        </main>
      </>
    );
  }

  const organizationId = organization.id;
  const basePath = resolverBasePath(orgSlug);
  const [config, branding] = await withOrganization(organizationId, () =>
    Promise.all([
      buscarConfiguracaoContato(organizationId),
      buscarBranding(organizationId),
    ])
  );
  const tema = resolverTemaEfetivo(branding.themeId, branding.customTheme);
  // Fase P.10 — mesmo fallback elegante de generateMetadata acima:
  // Organization.name nunca deixa de existir, então o site público nunca
  // fica sem nome mesmo sem branding configurado.
  const nomePublico = branding.displayName ?? organization.name;

  return (
    // display:contents — este wrapper só existe pra escopar os CSS vars
    // do tema no subtree público; não pode virar um novo item flex dentro
    // do body.flex.flex-col do layout raiz, senão quebra o flex-1 do
    // <main>. /app e /platform nunca renderizam este wrapper, então nunca
    // veem estes vars — é isso que garante que o tema não vaza pra lá.
    <div
      className="contents"
      style={
        {
          "--primary": tema.primary,
          "--primary-foreground": tema.onPrimary,
          "--primary-hover": tema.primaryHover,
          "--primary-light": tema.primaryLight,
          "--secondary": tema.secondary,
          "--border": tema.border,
          "--link": tema.link,
        } as React.CSSProperties
      }
    >
      <SiteHeader
        nome={nomePublico}
        logo={config.logo}
        logoAltura={config.logoAltura}
        navLinks={navLinks(basePath)}
        basePath={basePath}
      />
      <main className="flex-1">{children}</main>
      <SiteFooter
        nome={nomePublico}
        logo={config.logo}
        logoRodape={config.logoRodape}
        logoRodapeAltura={config.logoRodapeAltura}
        aparencia={branding.footerAppearance}
        basePath={basePath}
        // Contato acrescentado só no footer (rota pública real,
        // /[orgSlug]/contato) — o menu principal continua com os mesmos
        // 3 links de sempre, não mexido aqui.
        navLinks={[...navLinks(basePath), { href: `${basePath}/contato`, label: "Contato" }]}
        redesSociais={{
          instagram: config.instagram,
          facebook: config.facebook,
          youtube: config.youtube,
          linkedin: config.linkedin,
        }}
      />
      <BotaoContatoFlutuante
        nome={nomePublico}
        whatsapp={config.whatsapp}
        telefone={config.telefone || config.whatsapp}
        orgSlug={orgSlug}
      />
    </div>
  );
}
