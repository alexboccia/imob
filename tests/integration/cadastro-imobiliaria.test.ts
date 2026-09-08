import { describe, test, expect, afterEach, beforeAll, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn(), unstable_update: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

// E-mail mockado: é também o único jeito de o teste ver o token bruto,
// que só existe no link enviado (o banco guarda o sha256).
const emailsEnviados: { para: string; link: string }[] = [];
vi.mock("@/lib/email", () => ({
  enviarEmailCadastroImobiliaria: vi.fn(async ({ para, linkCadastro }) => {
    emailsEnviados.push({ para, link: linkCadastro });
    return { enviado: true };
  }),
}));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { criarUsuario } from "@/test/fixtures";
import { hashToken } from "@/lib/acesso-token";
import { solicitarCadastro } from "@/app/cadastro/actions";
import { confirmarCadastro } from "@/app/cadastro/[token]/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// =======================================================================
// Cadastro self-service de imobiliária (Fase 26) — contra o banco
// =======================================================================

const organizacoesCriadas: string[] = [];
const usuariosCriados: string[] = [];
const emailsUsados: string[] = [];

// O self-service resolve o plano por CÓDIGO. O banco de teste não tem os
// planos do seed de produção, então ele é garantido aqui — com os mesmos
// valores do plano de entrada real (trial de 14 dias, gratuito).
beforeAll(async () => {
  const existente = await prisma.plan.findUnique({ where: { code: "STARTER" } });
  if (!existente) {
    const plano = await prisma.plan.create({
      data: {
        code: "STARTER",
        name: "Starter",
        priceMonthlyCents: 0,
        isTrial: true,
        trialDays: 14,
        active: true,
      },
    });
    for (const code of ["core", "properties", "crm"]) {
      const modulo = await prisma.module.upsert({
        where: { code },
        update: {},
        create: { code, name: code },
      });
      await prisma.planModule.create({
        data: { planId: plano.id, moduleId: modulo.id, enabled: true },
      });
    }
    await prisma.planLimit.create({
      data: { planId: plano.id, feature: "USERS", limit: 1 },
    });
  }
});

afterEach(async () => {
  emailsEnviados.length = 0;
  for (const id of organizacoesCriadas.splice(0)) {
    await prisma.activityLog.deleteMany({ where: { organizationId: id } });
    await prisma.organizationMember.deleteMany({ where: { organizationId: id } });
    await prisma.subscription.deleteMany({ where: { organizationId: id } });
    await prisma.organization.deleteMany({ where: { id } });
  }
  for (const id of usuariosCriados.splice(0)) {
    await prisma.organizationMember.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  await prisma.signupToken.deleteMany({ where: { email: { in: emailsUsados.splice(0) } } });
});

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const tokenDoLink = (link: string) => link.split("/").pop()!;

// confirmarCadastro termina em redirect(), que o Next implementa lançando.
async function confirmar(token: string, senha?: string) {
  try {
    return await confirmarCadastro(
      token,
      ESTADO_INICIAL_ACAO,
      senha ? formData({ senha }) : new FormData()
    );
  } catch (erro) {
    if (erro && typeof erro === "object" && "digest" in erro) return { success: true };
    throw erro;
  }
}

async function pedir(nome: string, email: string, responsavel = "Pessoa Responsavel") {
  emailsUsados.push(email);
  return solicitarCadastro(
    ESTADO_INICIAL_ACAO,
    formData({ nomeImobiliaria: nome, nomeResponsavel: responsavel, email })
  );
}

async function registrarCriados(slug: string) {
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (org) organizacoesCriadas.push(org.id);
  return org;
}

describe("pedido de cadastro", () => {
  test("não cria organização nenhuma — só guarda a intenção e envia o link", async () => {
    const email = `novo-${Date.now()}@e2e.test`;
    const nome = `Imobiliaria Pedido ${Date.now()}`;

    const estado = await pedir(nome, email);
    expect(estado.success).toBe(true);

    // O ponto da fase: o tenant NÃO nasce aqui. Se nascesse, qualquer
    // e-mail digitado por qualquer pessoa deixaria um slug ocupado para
    // sempre e um trial consumido.
    expect(await prisma.organization.count({ where: { name: nome } })).toBe(0);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect(emailsEnviados).toHaveLength(1);
    expect(emailsEnviados[0].para).toBe(email);
  });

  test("o token bruto não é persistido — o banco guarda o sha256", async () => {
    const email = `hash-${Date.now()}@e2e.test`;
    await pedir(`Imobiliaria Hash ${Date.now()}`, email);

    const bruto = tokenDoLink(emailsEnviados[0].link);
    const registro = await prisma.signupToken.findFirstOrThrow({ where: { email } });

    expect(registro.tokenHash).toBe(hashToken(bruto));
    expect(JSON.stringify(registro)).not.toContain(bruto);
  });

  test("nome que não vira endereço é recusado, não silenciado com um slug inventado", async () => {
    const estado = await pedir("###", `simbolos-${Date.now()}@e2e.test`);
    expect(estado.success).toBe(false);
    expect(estado.fieldErrors?.nomeImobiliaria).toBeDefined();
    expect(emailsEnviados).toHaveLength(0);
  });

  test("nome que colide com rota reservada é recusado", async () => {
    const estado = await pedir("Platform", `reservado-${Date.now()}@e2e.test`);
    expect(estado.success).toBe(false);
    expect(emailsEnviados).toHaveLength(0);
  });

  test("endereço já em uso é recusado no formulário, onde dá para corrigir", async () => {
    const email = `dup-${Date.now()}@e2e.test`;
    const nome = `Imobiliaria Dup ${Date.now()}`;
    await pedir(nome, email);
    await confirmar(tokenDoLink(emailsEnviados[0].link), "senha-do-dono-1");
    const org = await registrarCriados(
      nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    );
    usuariosCriados.push((await prisma.user.findUniqueOrThrow({ where: { email } })).id);
    expect(org).not.toBeNull();

    emailsEnviados.length = 0;
    const segundo = await pedir(nome, `outro-${Date.now()}@e2e.test`);
    expect(segundo.success).toBe(false);
    expect(emailsEnviados).toHaveLength(0);
  });

  test("pedido novo invalida o anterior do mesmo e-mail", async () => {
    const email = `reenvio-${Date.now()}@e2e.test`;
    await pedir(`Imobiliaria Um ${Date.now()}`, email);
    const primeiro = tokenDoLink(emailsEnviados[0].link);
    await pedir(`Imobiliaria Dois ${Date.now()}`, email);

    expect(await prisma.signupToken.count({ where: { email } })).toBe(1);
    const comAntigo = await confirmar(primeiro, "senha-qualquer-1");
    expect(comAntigo.success).toBe(false);
  });
});

describe("confirmação: a organização nasce aqui", () => {
  async function comPedido(sufixo: string) {
    // Minúsculas de propósito: o produto NORMALIZA o e-mail, e um
    // sufixo com maiúscula faria o teste procurar um endereço que o
    // sistema (corretamente) nunca gravou.
    const email = `dono-${sufixo.toLowerCase()}-${Date.now()}@e2e.test`;
    const nome = `Imobiliaria ${sufixo} ${Date.now()}`;
    await pedir(nome, email);
    return { email, nome, token: tokenDoLink(emailsEnviados[0].link) };
  }

  test("cria organização, assinatura em trial, identidade e vínculo OWNER ativo", async () => {
    const { email, nome, token } = await comPedido("Completa");

    const estado = await confirmar(token, "senha-do-dono-1");
    expect(estado.success).toBe(true);

    const org = await prisma.organization.findFirstOrThrow({ where: { name: nome } });
    organizacoesCriadas.push(org.id);

    // Defaults preservados: fuso null (o produto resolve UTC e avisa que
    // ninguém escolheu) e visibilidade COLLABORATIVE.
    expect(org.active).toBe(true);
    expect(org.timezone).toBeNull();
    expect(org.commercialVisibility).toBe("COLLABORATIVE");

    // Assinatura em trial, calculada no servidor.
    const assinatura = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: org.id },
    });
    expect(assinatura.status).toBe("TRIALING");
    const dias = Math.round(
      (assinatura.currentPeriodEnd!.getTime() - assinatura.currentPeriodStart!.getTime()) /
        (24 * 60 * 60 * 1000)
    );
    expect(dias).toBe(14);

    const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
    usuariosCriados.push(usuario.id);
    expect(usuario.active).toBe(true);
    expect(await bcrypt.compare("senha-do-dono-1", usuario.passwordHash)).toBe(true);

    const vinculo = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: org.id, userId: usuario.id },
    });
    // OWNER é DERIVADO no servidor, e ACTIVE porque a posse do e-mail já
    // foi provada para chegar até aqui.
    expect(vinculo.role).toBe("OWNER");
    expect(vinculo.status).toBe("ACTIVE");
  });

  test("papel e plano enviados pelo formulário são ignorados", async () => {
    const { email, nome, token } = await comPedido("Forjada");

    // Um cliente adulterado mandando papel e plano junto.
    const fd = formData({ senha: "senha-do-dono-1" });
    fd.set("papel", "OWNER");
    fd.set("planId", "plano-premium-forjado");
    fd.set("role", "SUPER_ADMIN");
    fd.set("organizationId", "outra-organizacao");
    try {
      await confirmarCadastro(token, ESTADO_INICIAL_ACAO, fd);
    } catch {
      /* redirect */
    }

    const org = await prisma.organization.findFirstOrThrow({ where: { name: nome } });
    organizacoesCriadas.push(org.id);
    const starter = await prisma.plan.findUniqueOrThrow({ where: { code: "STARTER" } });
    // O plano é o do servidor, não o do formulário.
    expect(org.planId).toBe(starter.id);

    const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
    usuariosCriados.push(usuario.id);
    const vinculos = await prisma.organizationMember.findMany({ where: { userId: usuario.id } });
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0].organizationId).toBe(org.id);
  });

  test("replay: o mesmo link não cria uma segunda organização", async () => {
    const { email, nome, token } = await comPedido("Replay");
    await confirmar(token, "senha-do-dono-1");
    const org = await prisma.organization.findFirstOrThrow({ where: { name: nome } });
    organizacoesCriadas.push(org.id);
    usuariosCriados.push((await prisma.user.findUniqueOrThrow({ where: { email } })).id);

    const segunda = await confirmarCadastro(
      token,
      ESTADO_INICIAL_ACAO,
      formData({ senha: "outra-senha-1" })
    );

    expect(segunda.success).toBe(false);
    expect(await prisma.organization.count({ where: { name: nome } })).toBe(1);
  });

  test("duplo clique simultâneo cria UMA organização, nunca duas", async () => {
    const { email, nome, token } = await comPedido("DuploClique");

    await Promise.allSettled([
      confirmar(token, "senha-do-dono-1"),
      confirmar(token, "senha-do-dono-1"),
    ]);

    const orgs = await prisma.organization.findMany({ where: { name: nome } });
    expect(orgs).toHaveLength(1);
    organizacoesCriadas.push(orgs[0].id);
    const usuario = await prisma.user.findUnique({ where: { email } });
    if (usuario) usuariosCriados.push(usuario.id);
    expect(await prisma.organizationMember.count({ where: { organizationId: orgs[0].id } })).toBe(1);
  });

  test("token expirado é recusado e nada é criado", async () => {
    const { nome, token } = await comPedido("Expirada");
    await prisma.signupToken.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const estado = await confirmarCadastro(
      token,
      ESTADO_INICIAL_ACAO,
      formData({ senha: "senha-do-dono-1" })
    );
    expect(estado.success).toBe(false);
    expect(await prisma.organization.count({ where: { name: nome } })).toBe(0);
  });

  test("senha fora da política não queima o link", async () => {
    const { nome, token } = await comPedido("SenhaCurta");

    const recusada = await confirmarCadastro(
      token,
      ESTADO_INICIAL_ACAO,
      formData({ senha: "abc" })
    );
    expect(recusada.success).toBe(false);
    expect(await prisma.organization.count({ where: { name: nome } })).toBe(0);

    await confirmar(token, "agora-vale-123");
    const org = await prisma.organization.findFirstOrThrow({ where: { name: nome } });
    organizacoesCriadas.push(org.id);
    const membro = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: org.id },
    });
    usuariosCriados.push(membro.userId);
  });

  test("duas confirmações CONCORRENTES do mesmo slug criam UMA organização", async () => {
    const nome = `Imobiliaria Simultanea ${Date.now()}`;
    const emailA = `simult-a-${Date.now()}@e2e.test`;
    const emailB = `simult-b-${Date.now()}@e2e.test`;

    // Dois pedidos com o MESMO nome: no instante de cada pedido o slug
    // ainda não existia, então os dois foram aceitos.
    await pedir(nome, emailA);
    const tokenA = tokenDoLink(emailsEnviados[0].link);
    await pedir(nome, emailB);
    const tokenB = tokenDoLink(emailsEnviados[1].link);

    // Confirmadas ao mesmo tempo. Duas verificações prévias não bastam:
    // quem decide é a unique constraint do slug.
    const resultados = await Promise.allSettled([
      confirmar(tokenA, "senha-do-dono-1"),
      confirmar(tokenB, "senha-do-dono-2"),
    ]);
    expect(resultados).toHaveLength(2);

    const orgs = await prisma.organization.findMany({ where: { name: nome } });
    expect(orgs).toHaveLength(1);
    organizacoesCriadas.push(orgs[0].id);

    // Exatamente um OWNER, e o perdedor não deixou identidade órfã.
    const membros = await prisma.organizationMember.findMany({
      where: { organizationId: orgs[0].id },
    });
    expect(membros).toHaveLength(1);
    expect(membros[0].role).toBe("OWNER");
    usuariosCriados.push(membros[0].userId);

    const usuarioA = await prisma.user.findUnique({ where: { email: emailA } });
    const usuarioB = await prisma.user.findUnique({ where: { email: emailB } });
    const criados = [usuarioA, usuarioB].filter(Boolean);
    expect(criados).toHaveLength(1);
  });

  test("rollback: slug tomado no meio do caminho não deixa lixo", async () => {
    const nome = `Imobiliaria Corrida ${Date.now()}`;
    const emailA = `corrida-a-${Date.now()}@e2e.test`;
    const emailB = `corrida-b-${Date.now()}@e2e.test`;

    // Dois pedidos com o MESMO nome: o segundo passa porque, no instante
    // do pedido, o slug ainda não existia.
    await pedir(nome, emailA);
    const tokenA = tokenDoLink(emailsEnviados[0].link);
    await prisma.signupToken.deleteMany({ where: { email: emailB } });
    await pedir(nome, emailB);
    const tokenB = tokenDoLink(emailsEnviados[1].link);

    await confirmar(tokenA, "senha-do-dono-1");
    const org = await prisma.organization.findFirstOrThrow({ where: { name: nome } });
    organizacoesCriadas.push(org.id);
    usuariosCriados.push((await prisma.user.findUniqueOrThrow({ where: { email: emailA } })).id);

    const segundo = await confirmarCadastro(
      tokenB,
      ESTADO_INICIAL_ACAO,
      formData({ senha: "senha-do-dono-2" })
    );

    // A unique constraint é a ÚLTIMA defesa e ela funcionou: a mensagem
    // é acionável e nada ficou pela metade.
    expect(segundo.success).toBe(false);
    expect(segundo.message).toContain("endereço");
    expect(await prisma.organization.count({ where: { name: nome } })).toBe(1);
    // Nenhum User órfão de B, nenhuma Subscription solta.
    expect(await prisma.user.count({ where: { email: emailB } })).toBe(0);
    expect(await prisma.subscription.count({ where: { organizationId: org.id } })).toBe(1);
  });
});

describe("identidade que já existe", () => {
  test("ganha a nova organização sem segunda identidade e sem trocar a senha", async () => {
    const existente = await criarUsuario({ senha: "senha-original-123" });
    usuariosCriados.push(existente.id);
    emailsUsados.push(existente.email);

    const nome = `Imobiliaria Segunda ${Date.now()}`;
    await pedir(nome, existente.email, "Nome Digitado Agora");
    const estado = await confirmar(tokenDoLink(emailsEnviados[0].link));
    expect(estado.success).toBe(true);

    const org = await prisma.organization.findFirstOrThrow({ where: { name: nome } });
    organizacoesCriadas.push(org.id);

    // UMA identidade global.
    expect(await prisma.user.count({ where: { email: existente.email } })).toBe(1);

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: existente.id } });
    // A senha continua sendo a dela — abrir outra imobiliária não dá a
    // ninguém o poder de redefinir credencial alheia.
    expect(await bcrypt.compare("senha-original-123", depois.passwordHash)).toBe(true);
    // E o nome digitado no cadastro não sobrescreve o nome de quem já
    // tem conta.
    expect(depois.name).not.toBe("Nome Digitado Agora");

    const vinculo = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: org.id, userId: existente.id },
    });
    expect(vinculo.role).toBe("OWNER");
    expect(vinculo.status).toBe("ACTIVE");
  });

  test("e-mail com maiúsculas e espaços vira a mesma identidade normalizada", async () => {
    const base = `maiusculas-${Date.now()}@e2e.test`;
    const nome = `Imobiliaria Normalizada ${Date.now()}`;
    emailsUsados.push(base);

    await solicitarCadastro(
      ESTADO_INICIAL_ACAO,
      formData({
        nomeImobiliaria: nome,
        nomeResponsavel: "Pessoa Responsavel",
        email: `  ${base.toUpperCase()}  `,
      })
    );
    await confirmar(tokenDoLink(emailsEnviados[0].link), "senha-do-dono-1");

    const org = await prisma.organization.findFirstOrThrow({ where: { name: nome } });
    organizacoesCriadas.push(org.id);
    // Uma identidade, no formato canônico — nunca duas contas para a
    // mesma pessoa por causa de como ela digitou o próprio e-mail.
    const usuario = await prisma.user.findUniqueOrThrow({ where: { email: base } });
    usuariosCriados.push(usuario.id);
    expect(usuario.email).toBe(base);
  });

  test("o pedido para e-mail existente é indistinguível do pedido para e-mail novo", async () => {
    const existente = await criarUsuario();
    usuariosCriados.push(existente.id);
    emailsUsados.push(existente.email);
    const novo = `inexistente-${Date.now()}@e2e.test`;

    const comConta = await pedir(`Imobiliaria ComConta ${Date.now()}`, existente.email);
    const semConta = await pedir(`Imobiliaria SemConta ${Date.now()}`, novo);

    // Mesma resposta, mesma estrutura: o formulário não é um oráculo de
    // quem tem conta no produto.
    expect(comConta).toEqual(semConta);
    expect(emailsEnviados).toHaveLength(2);
  });
});
