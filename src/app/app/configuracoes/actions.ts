"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { LOGO_ALTURA_MIN, LOGO_ALTURA_MAX, LOGO_ALTURA_PADRAO } from "@/lib/logo";
import { temPapel, PAPEIS_GESTAO_CONFIGURACOES } from "@/lib/authorization";
import {
  type ActionState,
  erroAcessoNegado,
  erroValidacao,
  sucesso,
} from "@/lib/action-result";
import { tagConfiguracao, tagBranding } from "@/lib/cache-tags";
import { CATALOGO_TEMAS } from "@/lib/branding/temas";

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
  // Só um dos 6 temas pré-definidos do catálogo — nunca cor livre. Um
  // valor fora do catálogo (ex: manipulação do formulário) falha a
  // validação e a submissão inteira é rejeitada, em vez de gravar um
  // themeId inválido (resolverTema() cairia no padrão de qualquer forma,
  // mas rejeitar aqui evita gravar lixo no banco).
  themeId: z.enum(
    Object.keys(CATALOGO_TEMAS) as [string, ...string[]],
    { message: "Tema inválido." }
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

  const parsed = configuracaoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const campos = parsed.data;

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
  };

  const organizationId = await requireOrganizationId();
  await withOrganization(organizationId, async () => {
    await prisma.$transaction([
      prisma.organizationSettings.upsert({
        where: { organizationId },
        update: dados,
        create: { ...dados, organizationId },
      }),
      prisma.organizationBranding.upsert({
        where: { organizationId },
        update: { themeId: campos.themeId },
        create: { organizationId, themeId: campos.themeId },
      }),
    ]);

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
