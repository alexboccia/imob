import { notFound } from "next/navigation";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { getOrganizationBySlug } from "@/lib/tenant";
import { resolverBasePath } from "@/lib/site-url";
import { withOrganization } from "@/lib/tenant-context";
import { SiteHeader } from "@/components/SiteHeader";
import { BotaoContatoFlutuante } from "@/components/BotaoContatoFlutuante";

// Sem force-dynamic global: o cabeçalho (nome/logo/whatsapp) usa
// buscarConfiguracaoContato, que já é cacheada por organização com
// invalidação explícita (updateTag) em salvarConfiguracaoContato —
// isso garante a mesma atualização imediata que o force-dynamic dava,
// sem forçar toda página pública (inclusive /contato, que não tem
// nenhum dado dinâmico próprio) a renderizar do zero em toda requisição.

function navLinks(basePath: string) {
  return [
    { href: `${basePath}/imoveis?finalidade=SALE`, label: "Comprar" },
    { href: `${basePath}/imoveis?finalidade=RENT`, label: "Alugar" },
    { href: `${basePath}/imoveis?lancamento=1`, label: "Lançamentos" },
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
  const config = await withOrganization(organizationId, () =>
    buscarConfiguracaoContato(organizationId)
  );

  return (
    <>
      <SiteHeader
        nome={organization.name}
        logo={config.logo}
        logoAltura={config.logoAltura}
        navLinks={navLinks(basePath)}
        basePath={basePath}
      />
      <main className="flex-1">{children}</main>
      <footer className="border-t mt-16">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-gray-500">
          © {new Date().getFullYear()} {organization.name}. Todos os direitos
          reservados.
        </div>
      </footer>
      <BotaoContatoFlutuante
        nome={organization.name}
        whatsapp={config.whatsapp}
        telefone={config.telefone || config.whatsapp}
        orgSlug={orgSlug}
      />
    </>
  );
}
