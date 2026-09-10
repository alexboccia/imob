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
import { listarOrganizacoesAcessiveis } from "@/lib/organizacoes-do-usuario";
import { SeletorOrganizacao } from "@/components/admin/SeletorOrganizacao";
import {
  temPapel,
  PAPEIS_RESOLUCAO_IDENTIDADE,
  PAPEIS_GESTAO_CONFIGURACOES,
  PAPEIS_FINANCEIRO,
  PAPEIS_PERFIL_PUBLICO_PROPRIO,
} from "@/lib/authorization";
import { papelAtual } from "@/lib/papel-atual";

const TODOS_NAV_LINKS: {
  href: string;
  label: string;
  modulo?: string;
  papeis?: ReadonlySet<string>;
}[] = [
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
  // Fase 24 — fila de identificação. Primeiro item do menu com recorte
  // por PAPEL, e não só por módulo: um BROKER não decide a qual cliente
  // pertence um contato ambíguo, então o item não existe para ele. Isso
  // é higiene de interface — quem controla o acesso são a página e a
  // action, que verificam o papel no servidor.
  {
    href: "/app/captacoes",
    label: "Contatos a identificar",
    modulo: "crm",
    papeis: PAPEIS_RESOLUCAO_IDENTIDADE,
  },
  { href: "/app/caracteristicas", label: "Características" },
  { href: "/app/tipos-imovel", label: "Tipos de imóvel" },
  { href: "/app/usuarios", label: "Usuários" },
  // Autoatendimento do próprio perfil público — separado de "Usuários"
  // de propósito: manter a própria identidade no site não é gestão de
  // pessoas. Só aparece para quem pode ter perfil público; um assistente
  // não vê a porta, porque não pode entrar (ver
  // PAPEIS_PERFIL_PUBLICO_PROPRIO).
  {
    href: "/app/meu-perfil",
    label: "Meu perfil público",
    papeis: PAPEIS_PERFIL_PUBLICO_PROPRIO,
  },
  // Fase 25 — fecha a dívida que a Fase 24 deixou registrada ao criar o
  // recorte por papel. /app/configuracoes JÁ recusa quem não é
  // OWNER/ADMIN (gate de página da Fase 23), mas o item continuava no
  // menu: um corretor clicava e recebia "apenas administradores podem
  // alterar". Oferecer uma porta e negá-la na entrada é pior que não
  // mostrar a porta.
  //
  // Só esta entrada muda. /app/usuarios e /app/manutencao continuam
  // visíveis para todos DE PROPÓSITO: as duas telas renderizam conteúdo
  // real e útil em modo somente-leitura, não uma recusa.
  { href: "/app/configuracoes", label: "Configurações", papeis: PAPEIS_GESTAO_CONFIGURACOES },
  // Fase 27 — o contrato da imobiliária com o produto. Recortado por
  // PAPEIS_FINANCEIRO: um gestor comercial não responde pelo contrato.
  { href: "/app/assinatura", label: "Assinatura", papeis: PAPEIS_FINANCEIRO },
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
  // Links fora do alcance do papel são REMOVIDOS, não desabilitados: o
  // cadeado "Pro" convida a assinar um plano, enquanto um item que este
  // usuário jamais poderá abrir só anunciaria que existe uma tela que
  // não é dele.
  // Resolvido UMA vez, fora do filtro: o papel é o mesmo para todos os
  // links, e um await dentro do callback nem seria válido.
  const papel = await papelAtual();
  const NAV_LINKS = TODOS_NAV_LINKS.filter(
    (link) => !link.papeis || temPapel(papel, link.papeis)
  );
  const modulosHabilitados = new Map<string, boolean>();
  if (organizationId) {
    for (const link of NAV_LINKS) {
      if (link.modulo && !modulosHabilitados.has(link.modulo)) {
        modulosHabilitados.set(link.modulo, await hasModule(organizationId, link.modulo));
      }
    }
  }

  // Fase 26 — organizações acessíveis por esta identidade. UMA consulta
  // por requisição (cache() dentro do helper), no layout, e não por
  // componente: o seletor precisa da lista inteira e nenhuma outra tela
  // precisa dela.
  const organizacoes = await listarOrganizacoesAcessiveis(session.user.id);

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
        {/* O nome da imobiliária ATUAL no topo — antes havia só a
            palavra "Painel", que não dizia em qual tenant a pessoa
            estava. Com multi-org isso deixou de ser detalhe estético. */}
        <SeletorOrganizacao
          organizacoes={organizacoes}
          organizationIdAtual={organizationId ?? undefined}
        />
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
          organizacoes={organizacoes}
          organizationIdAtual={organizationId ?? undefined}
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
