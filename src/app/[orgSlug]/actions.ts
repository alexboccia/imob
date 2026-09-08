"use server";

import { headers } from "next/headers";
import { sanearAtribuicaoRecebida } from "@/lib/atribuicao";
import { prisma } from "@/lib/prisma";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { enviarEmailContato } from "@/lib/email";
import { contatoSchema, anuncieSchema } from "@/lib/contato-schema";
import { getOrganizationBySlug } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import { obterIpCliente } from "@/lib/client-ip";
import { obterKvStore } from "@/lib/kv-store";
import { verificarLimiteFormulario, normalizarContato, type FormularioTipo } from "@/lib/rate-limit";
import { registrarAbuso } from "@/lib/abuse-log";
import { hashCurto } from "@/lib/hash";
import { resolverPessoaParaFormularioPublico } from "@/lib/person-dedup";
import { ORIGENS_CAPTACAO, origemDoContato } from "@/lib/captacao";

// orgSlug chega via .bind(null, orgSlug) nos Client Components que chamam
// estas actions (ContatoForm/AnuncieForm/FormularioContato) — é input do
// navegador como qualquer outro (o bind pode ser reescrito via DevTools),
// então é sempre resolvido e revalidado aqui, nunca aceito como
// organizationId direto. Ver plano, seção "Modelo de isolamento e
// fronteira de segurança".
async function resolverOrganizacaoAtiva(
  orgSlug: string
): Promise<{ organizationId: string } | { erro: string }> {
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    return { erro: "Organização não encontrada." };
  }
  // Organização suspensa não deve continuar recebendo leads — ver plano,
  // seção "Modelo de isolamento". Mensagem genérica, não revela suspensão.
  if (!organization.active) {
    return { erro: "Formulário indisponível no momento." };
  }
  return { organizationId: organization.id };
}

// Menos de 1.5s entre o formulário aparecer na tela e ser enviado não é
// tempo humano realista de preencher nome/telefone/mensagem — quase
// sempre é um bot que já chega com o payload pronto.
const LIMIAR_MUITO_RAPIDO_MS = 1500;
const MENSAGEM_LIMITE_EXCEDIDO = "Muitas tentativas. Tente novamente mais tarde.";

async function protecoesAntiSpam(params: {
  formulario: FormularioTipo;
  formData: FormData;
  organizationId: string;
  contatoNormalizado: string;
}): Promise<{ bloqueado: true; erro: string } | { bloqueado: false }> {
  const ip = obterIpCliente(await headers());

  // Honeypot: campo invisível pra humanos. Preenchido = bot. Devolve
  // "sucesso" sem gravar nada, pra não ensinar o bot a se adaptar.
  const honeypot = params.formData.get("website");
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    registrarAbuso({ tipo: params.formulario, motivo: "honeypot", organizationId: params.organizationId, ip });
    return { bloqueado: true, erro: "" }; // erro vazio = chamador trata como sucesso silencioso
  }

  const renderizadoEm = Number(params.formData.get("renderizadoEm"));
  if (Number.isFinite(renderizadoEm) && Date.now() - renderizadoEm < LIMIAR_MUITO_RAPIDO_MS) {
    registrarAbuso({ tipo: params.formulario, motivo: "muito_rapido", organizationId: params.organizationId, ip });
    return { bloqueado: true, erro: "Envio muito rápido. Tente novamente." };
  }

  const store = obterKvStore();
  if (store) {
    const limite = await verificarLimiteFormulario(store, {
      formulario: params.formulario,
      ip,
      organizationId: params.organizationId,
      contatoNormalizado: params.contatoNormalizado,
    });
    if (!limite.permitido) {
      registrarAbuso({
        tipo: params.formulario,
        motivo: `rate_limit_${limite.motivo}`,
        organizationId: params.organizationId,
        ip,
        identificadorHash: params.contatoNormalizado ? hashCurto(params.contatoNormalizado) : undefined,
      });
      return { bloqueado: true, erro: MENSAGEM_LIMITE_EXCEDIDO };
    }
  }

  return { bloqueado: false };
}

// Atribuição de tráfego vinda do formulário (Fase 7). É observação do
// NAVEGADOR — só ele enxerga UTM e referrer — então chega como input não
// confiável e passa pelo mesmo saneamento do endpoint de tracking.
//
// Fronteira explícita: estes campos são PURAMENTE DESCRITIVOS. Nunca
// tocam organizationId, propertyId, Interaction.origin, Person.source
// nem autorização — tudo isso continua sendo derivado no servidor, como
// antes. Um payload adulterado só consegue mentir sobre de onde a pessoa
// diz que veio, jamais sobre em qual tenant ou imóvel o contato cai.
function atribuicaoDoFormulario(formData: FormData) {
  const bruto = formData.get("atribuicao");
  if (typeof bruto !== "string" || !bruto) return sanearAtribuicaoRecebida(null);
  try {
    // JSON.parse de input do navegador: sempre em try/catch. Um payload
    // quebrado vira "sem atribuição", nunca uma exceção que derrubaria o
    // contato inteiro.
    return sanearAtribuicaoRecebida(JSON.parse(bruto));
  } catch {
    return sanearAtribuicaoRecebida(null);
  }
}

export async function enviarContato(
  orgSlug: string,
  _prevState: unknown,
  formData: FormData
) {
  const parsed = contatoSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    mensagem: formData.get("mensagem"),
    imovelId: formData.get("imovelId") || undefined,
  });

  if (!parsed.success) {
    return { sucesso: false, erro: "Preencha os campos corretamente." };
  }

  const { nome, email, telefone, mensagem, imovelId } = parsed.data;

  const org = await resolverOrganizacaoAtiva(orgSlug);
  if ("erro" in org) return { sucesso: false, erro: org.erro };
  const { organizationId } = org;

  const protecao = await protecoesAntiSpam({
    formulario: "contato",
    formData,
    organizationId,
    contatoNormalizado: normalizarContato(email, telefone),
  });
  if (protecao.bloqueado) {
    return protecao.erro ? { sucesso: false, erro: protecao.erro } : { sucesso: true };
  }

  const { imovel, configContato, conflitoDedup } = await withOrganization(organizationId, async () => {
    // O imovelId chega do formulário (input não confiável) — precisa
    // pertencer a ESTA organização antes de virar o propertyId de uma
    // Interaction. Sem essa checagem, um imovelId de outra organização
    // criaria uma Interaction cruzando tenants (organizationId correto,
    // mas propertyId apontando pra um Property de outra org). Ver plano,
    // seção "Modelo de isolamento e fronteira de segurança".
    const imovel = imovelId
      ? await prisma.property.findUnique({
          where: { id: imovelId, organizationId },
          select: {
            title: true,
            responsibleMember: { select: { contactEmail: true } },
          },
        })
      : null;
    const imovelIdValidado = imovelId && imovel ? imovelId : null;

    // Deduplicação (Fase B do CRM): mesmo e-mail/telefone normalizado
    // dentro desta organização reutiliza a Person existente em vez de
    // criar uma nova a cada submissão. Em caso de conflito de identidade
    // (e-mail bate numa Person, telefone bate em outra), NÃO cria
    // Interaction nenhuma — decisão de produto explícita, ver
    // src/lib/person-dedup.ts. O visitante nunca sabe a diferença: a
    // resposta pública continua genérica de qualquer forma.
    const resolucao = await resolverPessoaParaFormularioPublico({
      organizationId,
      nome,
      email: email || null,
      telefone: telefone || null,
      role: "LEAD",
      source: "WEBSITE",
    });

    if (resolucao.tipo === "conflito") {
      // Fase 24 — DURABILIDADE ANTES DE SUCESSO. O e-mail e o telefone
      // apontam para Person diferentes: não dá para saber quem é, e
      // escolher seria inventar identidade. Em vez de descartar o
      // contato, o fato é persistido como captação pendente, com tudo
      // que veio do formulário e o instante do envio. Se este create
      // falhar, a exceção sobe e o visitante NÃO recebe sucesso.
      await prisma.leadCapture.create({
        data: {
          organizationId,
          name: nome,
          email: email || null,
          phone: telefone || null,
          message: mensagem,
          origin: origemDoContato(imovelIdValidado),
          role: "LEAD",
          propertyId: imovelIdValidado,
          ...atribuicaoDoFormulario(formData),
        },
      });
    } else {
      await prisma.interaction.create({
        data: {
          organizationId,
          personId: resolucao.personId,
          propertyId: imovelIdValidado,
          type: "MESSAGE",
          notes: mensagem,
          // Contexto de aquisição — não altera `origin`, que continua
          // derivado do imóvel validado logo acima.
          ...atribuicaoDoFormulario(formData),
          // Derivada do imóvel JÁ validado contra esta organização, não
          // de um campo do formulário: um imovelId de outro tenant é
          // anulado acima e o contato cai como "página de contato", em
          // vez de forjar origem de um imóvel que não é desta org.
          origin: origemDoContato(imovelIdValidado),
        },
      });
    }

    const configContato = await buscarConfiguracaoContato(organizationId);

    return { imovel, configContato, conflitoDedup: resolucao.tipo === "conflito" };
  });

  const emailDestino = imovel?.responsibleMember?.contactEmail || configContato.email;

  if (emailDestino && (await hasModule(organizationId, "email"))) {
    // Fase 24 — o e-mail é NOTIFICAÇÃO, não durabilidade. O contato já
    // está salvo no banco antes desta linha; se o Resend estiver fora,
    // o módulo desabilitado ou não houver destinatário, o lead continua
    // recuperável na fila de contatos pendentes. Antes, este e-mail era
    // a única chance de o contato sobreviver a um conflito.
    await enviarEmailContato({
      organizationId,
      para: emailDestino,
      nomeLead: nome,
      emailLead: email || null,
      telefoneLead: telefone || null,
      mensagem,
      imovelTitulo: imovel?.title,
      avisoConflitoDedup: conflitoDedup,
    });
  }

  return { sucesso: true };
}

export async function enviarAnuncioProprietario(
  orgSlug: string,
  _prevState: unknown,
  formData: FormData
) {
  const parsed = anuncieSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    descricaoImovel: formData.get("descricaoImovel"),
  });

  if (!parsed.success) {
    return { sucesso: false, erro: "Preencha os campos corretamente." };
  }

  const { nome, email, telefone, descricaoImovel } = parsed.data;

  const org = await resolverOrganizacaoAtiva(orgSlug);
  if ("erro" in org) return { sucesso: false, erro: org.erro };
  const { organizationId } = org;

  const protecao = await protecoesAntiSpam({
    formulario: "anuncie",
    formData,
    organizationId,
    contatoNormalizado: normalizarContato(email, telefone),
  });
  if (protecao.bloqueado) {
    return protecao.erro ? { sucesso: false, erro: protecao.erro } : { sucesso: true };
  }

  const { conflitoDedup } = await withOrganization(organizationId, async () => {
    // Mesma deduplicação de enviarContato — se a Person já existir (por
    // e-mail ou telefone), só adiciona o role OWNER (sem remover
    // LEAD/CLIENT que já existam); em conflito de identidade, não cria
    // nada, mesma decisão de produto.
    const resolucao = await resolverPessoaParaFormularioPublico({
      organizationId,
      nome,
      email: email || null,
      telefone,
      role: "OWNER",
      source: "WEBSITE",
      notesNaCriacao: `Quer anunciar imóvel: ${descricaoImovel}`,
    });

    // A descrição do imóvel agora vira Interaction, sempre. Antes ela ia
    // apenas em notesNaCriacao, que só é usada quando a Person é CRIADA:
    // um proprietário que já tinha contatado a imobiliária antes enviava
    // a descrição e ela se perdia por completo — sem interação, sem
    // notes, sem e-mail. O corretor via um lead novo com papel de
    // proprietário e nenhuma pista do que a pessoa queria anunciar.
    if (resolucao.tipo === "conflito") {
      // Fase 24 — mesma garantia do formulário de contato: o
      // proprietário que quer anunciar não pode desaparecer porque o
      // telefone dele já pertence a outro cadastro.
      await prisma.leadCapture.create({
        data: {
          organizationId,
          name: nome,
          email: email || null,
          phone: telefone,
          message: `Quer anunciar imóvel: ${descricaoImovel}`,
          origin: ORIGENS_CAPTACAO.ANUNCIE,
          role: "OWNER",
          ...atribuicaoDoFormulario(formData),
        },
      });
    } else {
      await prisma.interaction.create({
        data: {
          organizationId,
          personId: resolucao.personId,
          type: "MESSAGE",
          notes: `Quer anunciar imóvel: ${descricaoImovel}`,
          origin: ORIGENS_CAPTACAO.ANUNCIE,
          // /anuncie não tem imóvel, mas tem origem de tráfego: um
          // proprietário que veio de um anúncio no Instagram é
          // exatamente o tipo de informação que esta fase existe pra
          // registrar.
          ...atribuicaoDoFormulario(formData),
        },
      });
    }

    return { conflitoDedup: resolucao.tipo === "conflito" };
  });

  // E-mail para a imobiliária, como o formulário de contato já fazia.
  // Sem isto, uma solicitação de anúncio só existia dentro do painel e
  // ninguém era avisado de que ela chegou.
  const configContato = await buscarConfiguracaoContato(organizationId);
  if (configContato.email && (await hasModule(organizationId, "email"))) {
    await enviarEmailContato({
      organizationId,
      para: configContato.email,
      nomeLead: nome,
      emailLead: email || null,
      telefoneLead: telefone,
      mensagem: `Quer anunciar imóvel: ${descricaoImovel}`,
      avisoConflitoDedup: conflitoDedup,
    });
  }

  return { sucesso: true };
}
