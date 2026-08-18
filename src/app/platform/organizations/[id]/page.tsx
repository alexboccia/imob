import { notFound } from "next/navigation";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { prisma } from "@/lib/prisma";
import {
  FEATURE_PROPERTIES,
  FEATURE_USERS,
  FEATURE_PHOTOS_PER_PROPERTY,
  FEATURE_CRM_CLIENTS,
  resolverEntitlementsOrganizacao,
  resolverEstadoAcessoOrganizacao,
} from "@/lib/entitlements";
import { reaisDeCentavos } from "@/lib/plan-schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { AlterarPlanoForm } from "./AlterarPlanoForm";
import { EstenderTrialForm } from "./EstenderTrialForm";
import { OverridesForm } from "./OverridesForm";
import { DeletarOrganizationForm } from "./DeletarOrganizationForm";
import { ReenviarConviteForm } from "./ReenviarConviteForm";
import { AdicionarDominioForm } from "./AdicionarDominioForm";
import { DominioLinha } from "./DominioLinha";
import { EmailDomainSection } from "./EmailDomainSection";
import { suspenderOrganization, ativarOrganization } from "./actions";
import { resolverOnboarding } from "@/lib/platform/onboarding";

function LinhaUso({
  label,
  total,
  limite,
}: {
  label: string;
  total: number;
  limite: number | null;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {total} / {limite === null ? "ilimitado" : limite}
      </span>
    </div>
  );
}

function formatarData(data: Date | null): string {
  return data ? data.toLocaleDateString("pt-BR") : "—";
}

export default async function OrganizationDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformOperator();
  const { id } = await params;

  // Busca a Organization ANTES do resto — resolverEntitlementsOrganizacao/
  // resolverEstadoAcessoOrganizacao usam findUniqueOrThrow internamente
  // (src/lib/entitlements.ts), então rodar tudo num único Promise.all faria
  // uma organização já apagada (ex: logo após excluí-la, ver
  // deletarOrganization) estourar 500 em vez do 404 esperado abaixo.
  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      plan: {
        include: {
          planModules: { include: { module: true } },
          planLimits: true,
        },
      },
      limitOverrides: true,
      members: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!organization) notFound();

  // Organization não é tenant-scoped (consulta direto via `prisma`). As
  // contagens abaixo são em models tenant-scoped (Property/Person;
  // OrganizationMember não é tenant-scoped mas filtra por organizationId
  // mesmo assim por clareza) — como o `where` já inclui organizationId
  // explícito, a extension de tenant-scoping não interfere, sem precisar
  // de withOrganization() nem bypass.
  const [
    propertiesCount,
    activeMembersCount,
    personCount,
    planos,
    entitlements,
    estadoAcesso,
    dominios,
    emailDomain,
    onboarding,
  ] = await Promise.all([
    prisma.property.count({
      where: { organizationId: id, status: { in: ["DRAFT", "AVAILABLE", "RESERVED"] } },
    }),
    prisma.organizationMember.count({ where: { organizationId: id, status: "ACTIVE" } }),
    prisma.person.count({ where: { organizationId: id } }),
    prisma.plan.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    resolverEntitlementsOrganizacao(id),
    resolverEstadoAcessoOrganizacao(id),
    prisma.organizationDomain.findMany({ where: { organizationId: id }, orderBy: { createdAt: "asc" } }),
    prisma.organizationEmailDomain.findUnique({ where: { organizationId: id } }),
    resolverOnboarding(id),
  ]);

  const trial = organization.plan.isTrial
    ? await prisma.subscription.findFirst({
        where: { organizationId: id, status: "TRIALING" },
        orderBy: { createdAt: "desc" },
        select: { currentPeriodStart: true, currentPeriodEnd: true },
      })
    : null;

  const agora = new Date();
  const diasRestantesTrial =
    trial?.currentPeriodEnd != null
      ? Math.ceil((trial.currentPeriodEnd.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000))
      : null;

  type Feature = "PROPERTIES" | "PHOTOS_PER_PROPERTY" | "USERS" | "CRM_CLIENTS";
  const FEATURES: Feature[] = [FEATURE_PROPERTIES, FEATURE_PHOTOS_PER_PROPERTY, FEATURE_USERS, FEATURE_CRM_CLIENTS];
  const overridesAtuais = Object.fromEntries(
    FEATURES.map((feature) => {
      const linha = organization.limitOverrides.find((o) => o.feature === feature);
      if (!linha) return [feature, { modo: "PADRAO" as const, valor: null }];
      if (linha.limit === null) return [feature, { modo: "ILIMITADO" as const, valor: null }];
      return [feature, { modo: "PERSONALIZADO" as const, valor: linha.limit }];
    })
  ) as Record<Feature, { modo: "PADRAO" | "ILIMITADO" | "PERSONALIZADO"; valor: number | null }>;

  const convitePendente = organization.members.find(
    (membro) => membro.role === "OWNER" && membro.status === "INVITED"
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">{organization.name}</h1>
          {organization.active ? (
            <Badge className="bg-green-600 text-white">Ativa</Badge>
          ) : (
            <Badge variant="destructive">Suspensa</Badge>
          )}
          {estadoAcesso.bloqueado && estadoAcesso.motivo === "TRIAL_EXPIRADO" && (
            <Badge variant="destructive">Trial expirado</Badge>
          )}
          {organization.plan.isTrial && !estadoAcesso.bloqueado && (
            <Badge variant="secondary">Em trial</Badge>
          )}
          {organization.active ? (
            <form
              action={async () => {
                "use server";
                await suspenderOrganization(organization.id);
              }}
            >
              <Button type="submit" variant="destructive" size="sm">
                Suspender
              </Button>
            </form>
          ) : (
            <form
              action={async () => {
                "use server";
                await ativarOrganization(organization.id);
              }}
            >
              <Button type="submit" size="sm">
                Ativar
              </Button>
            </form>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {organization.slug} · criada em{" "}
          {organization.createdAt.toLocaleDateString("pt-BR")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Onboarding
            {onboarding.publicationStatus === "PRONTO" ? (
              <Badge className="ml-2 bg-green-600 text-white">Pronta para publicação</Badge>
            ) : (
              <Badge variant="secondary" className="ml-2">
                {onboarding.publicationStatus.replace("PENDENTE_", "Pendente: ").toLowerCase()}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {onboarding.itens.map((item) => (
              <li key={item.chave} className="flex items-center gap-2">
                <span
                  className={
                    item.status === "CONCLUIDO"
                      ? "text-green-600"
                      : item.status === "EM_ANDAMENTO"
                        ? "text-amber-600"
                        : "text-muted-foreground"
                  }
                >
                  {item.status === "CONCLUIDO" ? "✓" : item.status === "EM_ANDAMENTO" ? "…" : "○"}
                </span>
                <span className={item.status === "PENDENTE" ? "text-muted-foreground" : ""}>{item.label}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plano</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AlterarPlanoForm
            organizationId={organization.id}
            planoAtualId={organization.planId}
            planos={planos}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm pt-2 border-t">
            <div>
              <span className="text-muted-foreground">Preço padrão do plano: </span>
              <span className="font-medium">
                {entitlements.priceMonthlyCentsPadrao != null
                  ? `R$ ${reaisDeCentavos(entitlements.priceMonthlyCentsPadrao)}`
                  : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Preço efetivo: </span>
              <span className="font-medium">
                {entitlements.priceMonthlyCentsEfetivo != null
                  ? `R$ ${reaisDeCentavos(entitlements.priceMonthlyCentsEfetivo)}`
                  : "—"}
                {organization.priceMonthlyCentsOverride != null && " (override)"}
              </span>
            </div>
          </div>

          {organization.plan.isTrial && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm">
                <span className="text-muted-foreground">Trial: </span>
                {estadoAcesso.bloqueado && estadoAcesso.motivo === "TRIAL_EXPIRADO" ? (
                  <span className="text-destructive font-medium">expirado</span>
                ) : (
                  <span className="font-medium">
                    ativo{diasRestantesTrial != null && ` — ${diasRestantesTrial} dia${diasRestantesTrial === 1 ? "" : "s"} restante${diasRestantesTrial === 1 ? "" : "s"}`}
                  </span>
                )}
                {trial && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({formatarData(trial.currentPeriodStart)} até {formatarData(trial.currentPeriodEnd)})
                  </span>
                )}
              </p>
              <EstenderTrialForm organizationId={organization.id} />
            </div>
          )}

          <div className="space-y-1.5 pt-2 border-t">
            <LinhaUso label="Usuários ativos" total={activeMembersCount} limite={entitlements.limites.USERS} />
            <LinhaUso label="Imóveis ativos" total={propertiesCount} limite={entitlements.limites.PROPERTIES} />
            <LinhaUso label="Clientes CRM" total={personCount} limite={entitlements.limites.CRM_CLIENTS} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Fotos por imóvel</span>
              <span className="font-medium">
                até {entitlements.limites.PHOTOS_PER_PROPERTY === null ? "ilimitado" : entitlements.limites.PHOTOS_PER_PROPERTY}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overrides comerciais</CardTitle>
        </CardHeader>
        <CardContent>
          <OverridesForm
            organizationId={organization.id}
            precoOverrideAtualReais={reaisDeCentavos(organization.priceMonthlyCentsOverride)}
            overridesAtuais={overridesAtuais}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Módulos habilitados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {organization.plan.planModules.map((pm) => (
              <Badge
                key={pm.id}
                variant={pm.enabled ? "default" : "secondary"}
                className={pm.enabled ? "" : "text-muted-foreground"}
              >
                {pm.module.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Domínios</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Nenhum DNS/DigitalOcean/Cloudflare é alterado automaticamente aqui — cadastro é só o registro no
            easymob. Aponte um CNAME de <span className="font-mono">www</span> para{" "}
            <span className="font-mono">{process.env.CUSTOM_DOMAIN_CNAME_TARGET ?? "(configurar CUSTOM_DOMAIN_CNAME_TARGET)"}</span>
            , confirme o DNS, cadastre o domínio manualmente na DigitalOcean, aguarde o certificado, e só então marque
            o status como VERIFIED/ACTIVE aqui.
          </p>
          {dominios.length > 0 ? (
            <div className="divide-y">
              {dominios.map((dominio) => (
                <DominioLinha
                  key={dominio.id}
                  id={dominio.id}
                  hostname={dominio.hostname}
                  type={dominio.type}
                  status={dominio.status}
                  verifiedAt={dominio.verifiedAt?.toISOString() ?? null}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum domínio cadastrado.</p>
          )}
          <AdicionarDominioForm organizationId={organization.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">E-mail transacional</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Remetente das notificações automáticas (contato, convites) — nunca uma caixa de e-mail hospedada pelo
            easymob. Configure SPF/DKIM/DMARC no domínio conforme a configuração real do Resend antes de marcar como
            verificado.
          </p>
          <EmailDomainSection
            organizationId={organization.id}
            emailDomain={
              emailDomain
                ? {
                    domain: emailDomain.domain,
                    fromName: emailDomain.fromName,
                    fromAddress: emailDomain.fromAddress,
                    status: emailDomain.status,
                    verifiedAt: emailDomain.verifiedAt?.toISOString() ?? null,
                  }
                : null
            }
          />
        </CardContent>
      </Card>

      {convitePendente && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Convite pendente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">
              {convitePendente.user.name} ainda não ativou a conta. Reenvie o
              convite para o e-mail atual ou corrija o endereço abaixo.
            </p>
            <ReenviarConviteForm
              organizationId={organization.id}
              emailAtual={convitePendente.user.email}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Membros ({organization.members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {organization.members.map((membro) => (
              <div
                key={membro.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{membro.user.name}</p>
                  <p className="text-muted-foreground">{membro.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{membro.role}</Badge>
                  <Badge
                    variant={membro.status === "ACTIVE" ? "default" : "secondary"}
                  >
                    {membro.status}
                  </Badge>
                </div>
              </div>
            ))}
            {organization.members.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                Nenhum membro ainda.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Zona de risco</CardTitle>
        </CardHeader>
        <CardContent>
          <DeletarOrganizationForm organizationId={organization.id} slug={organization.slug} />
        </CardContent>
      </Card>
    </div>
  );
}
