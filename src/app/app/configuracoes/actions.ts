"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { logActivity } from "@/lib/activity-log";
import { LOGO_ALTURA_MIN, LOGO_ALTURA_MAX, LOGO_ALTURA_PADRAO } from "@/lib/logo";
import { temPapel, PAPEIS_GESTAO_CONFIGURACOES } from "@/lib/authorization";
import {
  type ActionState,
  erroAcessoNegado,
  erroGenerico,
  erroValidacao,
  sucesso,
} from "@/lib/action-result";
import { tagConfiguracao, tagBranding } from "@/lib/cache-tags";
import { CATALOGO_TEMAS } from "@/lib/branding/temas";
import { CATALOGO_APARENCIA_RODAPE } from "@/lib/branding/aparencia-rodape";
import { validarFaviconUrl } from "@/lib/branding/favicon-url";

const vazioParaNulo = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const configuracaoSchema = z.object({
  telefone: z.preprocess(vazioParaNulo, z.string().optional()),
  email: z.preprocess(
    vazioParaNulo,
    z.string().email("E-mail inválido.").optional()
  ),
  whatsapp: z.preprocess(vazioParaNulo, z.string().optional()),
  instagram: z.preprocess(vazioParaNulo, z.string().optional()),
  facebook: z.preprocess(vazioParaNulo, z.string().optional()),
  youtube: z.preprocess(vazioParaNulo, z.string().optional()),
  linkedin: z.preprocess(vazioParaNulo, z.string().optional()),
  codigoImovelPrefixo: z.preprocess(
    vazioParaNulo,
    z.string().max(10, "Use no máximo 10 caracteres.").optional()
  ),
  logo: z.preprocess(vazioParaNulo, z.string().optional()),
  logoAltura: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().optional()
  ),
  // Logotipo dedicado ao rodapé (OrganizationSettings.footerLogoUrl) —
  // mesmo tratamento de `logo` acima, campo opcional e independente.
  logoRodape: z.preprocess(vazioParaNulo, z.string().optional()),
  // Aparência do rodapé: só um dos valores do catálogo fixo (mesmo
  // racional de themeId acima) — nunca cor/CSS livre.
  footerAparencia: z.enum(
    CATALOGO_APARENCIA_RODAPE.map((opcao) => opcao.id) as [string, ...string[]],
    { message: "Aparência de rodapé inválida." }
  ),
  // Só um dos 6 temas pré-definidos do catálogo — nunca cor livre. Um
  // valor fora do catálogo (ex: manipulação do formulário) falha a
  // validação e a submissão inteira é rejeitada, em vez de gravar um
  // themeId inválido (resolverTema() cairia no padrão de qualquer forma,
  // mas rejeitar aqui evita gravar lixo no banco).
  themeId: z.enum(
    Object.keys(CATALOGO_TEMAS) as [string, ...string[]],
    { message: "Tema inválido." }
  ),
  favicon: z.preprocess(vazioParaNulo, z.string().optional()),
  // Fase P.10 — nome público exibido no site, quando diverge do nome
  // "oficial"/legal da organização (Organization.name). Nunca cor/CSS
  // livre — reaproveita themeId (catálogo fixo) pra isso, ver
  // OrganizationBranding no schema.
  nomePublico: z.preprocess(
    vazioParaNulo,
    z.string().max(120, "Use no máximo 120 caracteres.").optional()
  ),
});

function alturaLogo(valor: number | undefined) {
  if (valor === undefined || !Number.isFinite(valor) || valor <= 0) {
    return LOGO_ALTURA_PADRAO;
  }
  return Math.min(LOGO_ALTURA_MAX, Math.max(LOGO_ALTURA_MIN, Math.round(valor)));
}

export async function salvarConfiguracaoContato(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(session.user.role, PAPEIS_GESTAO_CONFIGURACOES)) {
    return erroAcessoNegado();
  }

  // Antes do parse: validarFaviconUrl precisa do organizationId da sessão
  // pra checar o prefixo do objeto no R2 (ver favicon-url.ts) — nunca do
  // organizationId de qualquer outro lugar.
  const organizationId = await requireOrganizationId();

  const parsed = configuracaoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const campos = parsed.data;

  // Defesa contra SSRF/proxy arbitrário: favicon só pode apontar pro
  // bucket R2 oficial da aplicação, dentro do prefixo desta organização —
  // nunca uma URL externa arbitrária nem o objeto de outro tenant. Ver
  // validarFaviconUrl (revalidado de novo em [orgSlug]/icon.tsx, que nunca
  // confia só nesta checagem).
  if (campos.favicon && !validarFaviconUrl(campos.favicon, organizationId)) {
    return erroGenerico(
      "Favicon inválido — envie a imagem novamente pelo formulário."
    );
  }

  const dados = {
    phone: campos.telefone ?? null,
    email: campos.email ?? null,
    whatsapp: campos.whatsapp ?? null,
    instagram: campos.instagram ?? null,
    facebook: campos.facebook ?? null,
    youtube: campos.youtube ?? null,
    linkedin: campos.linkedin ?? null,
    propertyCodePrefix: campos.codigoImovelPrefixo?.toUpperCase() ?? null,
    logoUrl: campos.logo ?? null,
    logoHeight: alturaLogo(campos.logoAltura),
    footerLogoUrl: campos.logoRodape ?? null,
  };

  await withOrganization(organizationId, async () => {
    await prisma.$transaction([
      prisma.organizationSettings.upsert({
        where: { organizationId },
        update: dados,
        create: { ...dados, organizationId },
      }),
      prisma.organizationBranding.upsert({
        where: { organizationId },
        update: {
          themeId: campos.themeId,
          faviconUrl: campos.favicon ?? null,
          displayName: campos.nomePublico ?? null,
          footerAppearance: campos.footerAparencia,
        },
        create: {
          organizationId,
          themeId: campos.themeId,
          faviconUrl: campos.favicon ?? null,
          displayName: campos.nomePublico ?? null,
          footerAppearance: campos.footerAparencia,
        },
      }),
    ]);

    // Fase P.10 — auditoria tenant-scoped (logActivity/ActivityLog), NÃO
    // PlatformAuditLog: quem faz esta mudança é o próprio admin da
    // organização (self-service), não um Platform Operator. Ver regra
    // geral em src/lib/platform/audit.ts vs src/lib/activity-log.ts.
    await logActivity({
      organizationId,
      userId: session.user.id,
      entity: "OrganizationBranding",
      action: "branding_updated",
      payload: { themeId: campos.themeId, nomePublico: campos.nomePublico ?? null },
    });

    revalidatePath("/app/configuracoes");
    revalidatePath("/app/imoveis");
    updateTag(tagConfiguracao(organizationId));
    updateTag(tagBranding(organizationId));
    // Redundância deliberada: não consegui verificar ao vivo (limitação
    // de ferramental pra invocar Server Actions fora do navegador, mesma
    // limitação já documentada em fases anteriores desta sessão) que
    // updateTag() dentro deste callback aninhado realmente invalida a
    // entrada de unstable_cache do site público. Como essa exata classe
    // de bug (config desatualizada no site público) já aconteceu neste
    // projeto antes, mantenho revalidatePath("/", "layout") como rede de
    // segurança até confirmar manualmente em produção.
    revalidatePath("/", "layout");
  });

  return sucesso("Configurações salvas.");
}
