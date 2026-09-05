import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteUrl, resolverBasePath } from "@/lib/site-url";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { AdminMobileNav } from "@/components/admin/AdminMobileNav";
import { PAPEL_USUARIO_LABEL } from "@/lib/format";
import { hasModule } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity-log";

const NAV_LINKS = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/imoveis", label: "Imóveis" },
  { href: "/app/clientes", label: "Clientes", modulo: "crm" },
  { href: "/app/pipeline", label: "Pipeline", modulo: "crm" },
  { href: "/app/agenda", label: "Agenda", modulo: "crm" },
  // Analytics comercial (Fase 5) — mesmo portão de módulo das outras
  // telas de CRM: é uma agregação de Interaction, exatamente o dado que
  // Clientes/Pipeline/Agenda já mostram linha a linha. Fica logo depois
  // delas, fechando o bloco de CRM, e nunca antes de Imóveis/Clientes
  // (que são o trabalho diário, não a leitura gerencial).
  { href: "/app/analytics", label: "Analytics", modulo: "crm" },
  { href: "/app/caracteristicas", label: "Características" },
  { href: "/app/tipos-imovel", label: "Tipos de imóvel" },
  { href: "/app/usuarios", label: "Usuários" },
  { href: "/app/configuracoes", label: "Configurações" },
  { href: "/app/manutencao", label: "Manutenção" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    return children;
  }

  const organizationId = session.user.organizationId;
  const modulosHabilitados = new Map<string, boolean>();
  if (organizationId) {
    for (const link of NAV_LINKS) {
      if (link.modulo && !modulosHabilitados.has(link.modulo)) {
        modulosHabilitados.set(link.modulo, await hasModule(organizationId, link.modulo));
      }
    }
  }

  // "Ver site" precisa do slug da organização (a sessão só carrega
  // organizationId) — busca direta, Organization não é tenant-scoped.
  const organization = organizationId
    ? await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { slug: true },
      })
    : null;
  const siteUrl = organization
    ? getSiteUrl(resolverBasePath(organization.slug) || "/")
    : null;

  async function logoutAction() {
    "use server";
    if (session!.user.organizationId) {
      await logActivity({
        organizationId: session!.user.organizationId,
        userId: session!.user.id,
        entity: "Session",
        action: "logout",
      });
    }
    await signOut({ redirectTo: "/app/login" });
  }

  const navLinksParaMobile = NAV_LINKS.map((link) => ({
    href: link.href,
    label: link.label,
    liberado: !link.modulo || Boolean(modulosHabilitados.get(link.modulo)),
  }));

  return (
    <div className="min-h-screen flex">
      {/* hidden md:flex — abaixo de md (768px) a sidebar fixa (224px) não
          cabe mais numa viewport mobile sem espremer o conteúdo principal
          a quase nada (achado histórico, documentado em várias telas desta
          mesma pasta: ~136-151px de coluna real útil em 360-375px). Nesse
          intervalo, AdminMobileNav assume a navegação via header
          compacto + Sheet — desktop/tablet largo (>=768px) continua
          exatamente como antes, sem nenhuma mudança visual. */}
      <aside className="hidden md:flex min-w-0 w-56 border-r bg-gray-50 flex-col">
        <div className="px-4 py-4 font-semibold border-b">Painel</div>
        {siteUrl && (
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border-b"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Ver site
          </a>
        )}
        <nav className="flex-1 px-2 py-4 space-y-1 text-sm">
          {NAV_LINKS.map((link) => {
            const liberado = !link.modulo || modulosHabilitados.get(link.modulo);
            if (!liberado) {
              return (
                <span
                  key={link.href}
                  title="Disponível em planos superiores"
                  className="flex items-center justify-between rounded-md px-3 py-2 text-gray-400 cursor-not-allowed"
                >
                  {link.label}
                  <Badge variant="secondary" className="text-[10px]">
                    Pro
                  </Badge>
                </span>
              );
            }
            return (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-md px-3 py-2 hover:bg-gray-100"
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t text-sm">
          <p className="font-medium truncate">{session.user?.name}</p>
          <p className="text-gray-500 truncate">
            {PAPEL_USUARIO_LABEL[session.user?.role ?? ""] ?? session.user?.role}
          </p>
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="link"
              className="mt-2 h-auto p-0 text-destructive"
            >
              Sair
            </Button>
          </form>
        </div>
      </aside>
      {/* min-w-0: sem isso, um flex item nunca encolhe abaixo da largura
          intrínseca do conteúdo — uma tabela larga "empurra" a página
          inteira em vez de rolar dentro do próprio overflow-x-auto (bug
          pré-existente, reproduzido em /app/imoveis e /app/usuarios antes
          desta correção, não só em /app/clientes). */}
      <div className="min-w-0 flex-1 flex flex-col">
        <AdminMobileNav
          navLinks={navLinksParaMobile}
          siteUrl={siteUrl}
          userName={session.user?.name}
          userRoleLabel={PAPEL_USUARIO_LABEL[session.user?.role ?? ""] ?? session.user?.role ?? ""}
          logoutAction={logoutAction}
        />
        {/* p-4 md:p-6: mobile ganha um pouco mais de largura útil de volta
            (16px vs 24px de cada lado) — modesto, mas soma com a sidebar
            oculta pra devolver a maior parte da viewport ao conteúdo. */}
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
