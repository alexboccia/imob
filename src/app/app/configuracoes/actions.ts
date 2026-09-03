"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { logActivity } from "@/lib/activity-log";
import {
  LOGO_ALTURA_MIN,
  LOGO_ALTURA_MAX,
  LOGO_ALTURA_PADRAO,
  LOGO_RODAPE_ALTURA_MIN,
  LOGO_RODAPE_ALTURA_MAX,
  LOGO_RODAPE_ALTURA_PADRAO,
} from "@/lib/logo";
import { temPapel, PAPEIS_GESTAO_CONFIGURACOES } from "@/lib/authorization";
import {
  type ActionState,
  erroAcessoNegado,
  erroGenerico,
  erroValidacao,
  sucesso,
} from "@/lib/action-result";
import { tagConfiguracao, tagBranding } from "@/lib/cache-tags";
import { CATALOGO_TEMAS, THEME_ID_CUSTOMIZADO } from "@/lib/branding/temas";
import { CATALOGO_APARENCIA_RODAPE } from "@/lib/branding/aparencia-rodape";
import { validarFaviconUrl, validarUrlMidiaOrganizacao } from "@/lib/branding/favicon-url";
import { gerarPaletaDoLogo, type MotivoFalhaExtracao } from "@/lib/branding/extrair-paleta-logo";
import { tokensTemaSchema } from "@/lib/branding/tokens-tema-schema";
import type { TokensTema } from "@/lib/branding/temas";

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
  // Altura do logo do rodapé — mesmo tratamento de `logoAltura`, com
  // clamp próprio (ver alturaLogoRodape abaixo).
  logoRodapeAltura: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().optional()
  ),
  // Imagem do Hero da Home (OrganizationSettings.heroImageUrl) — mesmo
  // tratamento de `logo`/`logoRodape`, campo opcional. Revalidada contra
  // o prefixo do próprio tenant no R2 abaixo (mesma checagem do
  // favicon) antes de persistir — nunca aceitar uma URL arbitrária vinda
  // do client como imagem do Hero.
  heroImage: z.preprocess(vazioParaNulo, z.string().optional()),
  // Aparência do rodapé: só um dos valores do catálogo fixo (mesmo
  // racional de themeId acima) — nunca cor/CSS livre.
  footerAparencia: z.enum(
    CATALOGO_APARENCIA_RODAPE.map((opcao) => opcao.id) as [string, ...string[]],
    { message: "Aparência de rodapé inválida." }
  ),
  // Um dos 6 temas pré-definidos do catálogo, OU o sentinela "custom"
  // (THEME_ID_CUSTOMIZADO) — nunca cor livre nos dois casos: "custom"
  // só faz sentido escolhido quando a organização já tem um
  // OrganizationBranding.customTheme válido gerado via
  // aplicarPaletaGerada abaixo (nunca setado por este formulário
  // diretamente); se não tiver, resolverTemaEfetivo cai no tema padrão
  // de qualquer forma — nunca quebra, só não é o resultado visual
  // esperado. Um valor fora dessas opções falha a validação e a
  // submissão inteira é rejeitada, em vez de gravar um themeId inválido.
  themeId: z.enum(
    [THEME_ID_CUSTOMIZADO, ...Object.keys(CATALOGO_TEMAS)] as [string, ...string[]],
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

// Mesmo racional de alturaLogo, com os limites do rodapé: valor ausente
// ou inválido (texto, negativo, NaN) cai no padrão em vez de gravar lixo,
// e o clamp impede que um número absurdo vindo do form quebre o layout do
// rodapé.
function alturaLogoRodape(valor: number | undefined) {
  if (valor === undefined || !Number.isFinite(valor) || valor <= 0) {
    return LOGO_RODAPE_ALTURA_PADRAO;
  }
  return Math.min(
    LOGO_RODAPE_ALTURA_MAX,
    Math.max(LOGO_RODAPE_ALTURA_MIN, Math.round(valor))
  );
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

  // Mesma defesa contra SSRF/URL arbitrária do favicon acima — a imagem
  // do Hero só pode apontar pro objeto que o próprio upload desta
  // organização acabou de gravar no R2, nunca uma URL externa.
  if (campos.heroImage && !validarUrlMidiaOrganizacao(campos.heroImage, organizationId, "hero")) {
    return erroGenerico(
      "Imagem do Hero inválida — envie a imagem novamente em Identidade visual."
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
    footerLogoHeight: alturaLogoRodape(campos.logoRodapeAltura),
    heroImageUrl: campos.heroImage ?? null,
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

// ---------- Tema personalizado gerado a partir do logotipo ----------

type MotivoFalhaPaletaCompleto = MotivoFalhaExtracao | "sem_logo" | "logo_invalido";

function mensagemFalhaPaleta(motivo: MotivoFalhaPaletaCompleto): string {
  switch (motivo) {
    case "sem_logo":
      return "Nenhum logotipo salvo ainda — envie um logotipo e clique em \"Salvar alterações\" antes de gerar uma paleta automática.";
    case "logo_invalido":
      return "Logotipo inválido — envie a imagem novamente em Identidade visual.";
    case "falha_download":
      return "Não foi possível acessar o logotipo configurado. Tente novamente.";
    case "arquivo_grande_demais":
      return "O logotipo configurado é grande demais para ser analisado.";
    case "falha_processamento":
      return "Não foi possível processar a imagem do logotipo.";
    case "sem_pixels_opacos":
      return "O logotipo está totalmente transparente — não há cor para extrair.";
    case "sem_cor_dominante":
      return "Não encontramos uma cor de marca clara nesse logotipo (ele parece ser só preto, branco ou cinza). Tente um logotipo com mais cor.";
  }
}

export type ResultadoPreviaPaleta = { ok: true; tokens: TokensTema } | { ok: false; erro: string };

// Resolve o logotipo ATUAL da organização autenticada (nunca de uma URL
// vinda do client — session/DB são a única fonte) e roda a extração de
// paleta. Compartilhado por gerarPreviaPaletaLogotipo (só leitura) e
// aplicarPaletaGerada (persiste) — cada chamada RE-GERA do zero, nunca
// confia num resultado antigo devolvido ao client; é isso que garante
// que "aplicar" nunca persiste uma cor que não veio de uma nova análise
// determinística do logotipo real desta organização.
async function resolverPaletaAtual(organizationId: string): Promise<ResultadoPreviaPaleta> {
  const settings = await prisma.organizationSettings.findFirst({
    where: { organizationId },
    select: { logoUrl: true },
  });
  const logoUrl = settings?.logoUrl;
  if (!logoUrl) return { ok: false, erro: mensagemFalhaPaleta("sem_logo") };

  // Defesa contra SSRF: só buscamos uma URL comprovadamente dentro do
  // bucket R2 oficial, no prefixo desta organização — mesma checagem já
  // usada pro favicon (favicon-url.ts), nunca um fetch pra URL arbitrária.
  if (!validarUrlMidiaOrganizacao(logoUrl, organizationId)) {
    return { ok: false, erro: mensagemFalhaPaleta("logo_invalido") };
  }

  const resultado = await gerarPaletaDoLogo(logoUrl);
  if (!resultado.ok) return { ok: false, erro: mensagemFalhaPaleta(resultado.motivo) };
  return { ok: true, tokens: resultado.tokens };
}

// Só leitura — NUNCA escreve no banco. "Gerar" é deliberadamente uma
// ação separada de "aplicar" (aplicarPaletaGerada abaixo): esta função
// existe só pra alimentar a prévia da UI (ver GeradorTemaLogotipo.tsx).
export async function gerarPreviaPaletaLogotipo(): Promise<ResultadoPreviaPaleta> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(session.user.role, PAPEIS_GESTAO_CONFIGURACOES)) {
    return { ok: false, erro: "Você não tem permissão para gerar uma paleta." };
  }

  const organizationId = await requireOrganizationId();
  return resolverPaletaAtual(organizationId);
}

// Persiste o tema personalizado — SÓ é chamada quando o usuário clica
// "Aplicar paleta" (nunca automaticamente pelo upload do logo, nem ao
// mexer no conta-gotas da prévia).
//
// Recebe os tokens EXIBIDOS na prévia porque a paleta sugerida passou a
// ser editável (conta-gotas por cor, ver GeradorTemaLogotipo.tsx): se
// aqui re-gerasse do logotipo como antes, as cores ajustadas pelo usuário
// seriam silenciosamente descartadas no momento de aplicar. Aceitar os
// tokens do client NÃO afrouxa a segurança que o formato antigo dava: o
// que impedia CSS arbitrário nunca foi a origem do valor, e sim o
// tokensTemaSchema (oklch(L C H) com faixas numéricas fechadas, .strict()),
// que continua sendo aplicado abaixo antes de qualquer gravação — some
// com qualquer string que não seja uma cor OKLCH válida. Permissão de
// gestão de configurações também continua exigida acima.
//
// Sem tokens (chamada legada/sem prévia), cai no comportamento anterior:
// re-gera do logotipo atual.
export async function aplicarPaletaGerada(tokens?: unknown): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");
  if (!temPapel(session.user.role, PAPEIS_GESTAO_CONFIGURACOES)) {
    return erroAcessoNegado();
  }

  const organizationId = await requireOrganizationId();

  let tokensParaValidar: unknown = tokens;
  if (tokensParaValidar === undefined || tokensParaValidar === null) {
    const resultado = await resolverPaletaAtual(organizationId);
    if (!resultado.ok) return erroGenerico(resultado.erro);
    tokensParaValidar = resultado.tokens;
  }

  const validado = tokensTemaSchema.safeParse(tokensParaValidar);
  if (!validado.success) {
    return erroGenerico("Falha ao gerar a paleta — tente novamente.");
  }

  await withOrganization(organizationId, async () => {
    await prisma.organizationBranding.upsert({
      where: { organizationId },
      update: { themeId: THEME_ID_CUSTOMIZADO, customTheme: validado.data },
      create: { organizationId, themeId: THEME_ID_CUSTOMIZADO, customTheme: validado.data },
    });

    await logActivity({
      organizationId,
      userId: session.user.id,
      entity: "OrganizationBranding",
      action: "custom_theme_applied",
      payload: { origem: "logo" },
    });

    revalidatePath("/app/configuracoes");
    revalidatePath("/app/imoveis");
    updateTag(tagBranding(organizationId));
    // Mesma rede de segurança documentada em salvarConfiguracaoContato
    // acima — não confiar só em updateTag() invalidar o site público.
    revalidatePath("/", "layout");
  });

  return sucesso("Paleta personalizada aplicada.");
}
