import { siteConfig } from "@/lib/site-config";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { getPublicOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { SiteHeader } from "@/components/SiteHeader";
import { BotaoContatoFlutuante } from "@/components/BotaoContatoFlutuante";

// Garante que o cabeçalho (nome/logo/whatsapp) sempre reflita o que está em
// Configurações, sem depender de revalidação de cache por instância.
export const dynamic = "force-dynamic";

const NAV_LINKS = [
  { href: "/imoveis?finalidade=SALE", label: "Comprar" },
  { href: "/imoveis?finalidade=RENT", label: "Alugar" },
  { href: "/imoveis?lancamento=1", label: "Lançamentos" },
];

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const organizationId = await getPublicOrganizationId();
  const config = await withOrganization(organizationId, () =>
    buscarConfiguracaoContato(organizationId)
  );

  return (
    <>
      <SiteHeader
        nome={siteConfig.nome}
        logo={config.logo}
        logoAltura={config.logoAltura}
        navLinks={NAV_LINKS}
      />
      <main className="flex-1">{children}</main>
      <footer className="border-t mt-16">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-gray-500">
          © {new Date().getFullYear()} {siteConfig.nome}. Todos os direitos
          reservados.
        </div>
      </footer>
      <BotaoContatoFlutuante
        nome={siteConfig.nome}
        whatsapp={config.whatsapp}
        telefone={config.telefone || config.whatsapp}
      />
    </>
  );
}
