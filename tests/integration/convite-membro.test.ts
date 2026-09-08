import { describe, test, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

const convitesEnviados: { para: string; link: string; jaTemConta: boolean }[] = [];
let falharEnvio = false;
vi.mock("@/lib/email", () => ({
  enviarEmailConviteMembro: vi.fn(async ({ para, linkConvite, jaTemConta }) => {
    if (falharEnvio) return { enviado: false };
    convitesEnviados.push({ para, link: linkConvite, jaTemConta });
    return { enviado: true };
  }),
  enviarEmailRecuperacaoSenha: vi.fn(async () => ({ enviado: true })),
}));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { OrganizationRole } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { criarCenario, criarUsuario, criarMembro } from "@/test/fixtures";
import { hashToken } from "@/lib/acesso-token";
import { convidarUsuario, reenviarConviteUsuario } from "@/app/app/usuarios/actions";
import { definirSenhaConvite } from "@/app/app/convite/[token]/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// =======================================================================
// Convite de membro (Fase 25) — contra o banco
// =======================================================================

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
const usuariosAvulsos: string[] = [];

afterEach(async () => {
  convitesEnviados.length = 0;
  falharEnvio = false;
  vi.mocked(auth).mockReset();
  while (usuariosAvulsos.length) {
    const id = usuariosAvulsos.pop()!;
    await prisma.inviteToken.deleteMany({ where: { userId: id } });
    await prisma.organizationMember.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
  cenarios.push(cenario);
  return cenario;
}

// Fase 27 — o papel agora vem do VÍNCULO, não do token: autorização
// server-side lê a membership atual. Um teste que "finge" um papel na
// sessão sem o vínculo correspondente passou a testar uma ficção, então
// o helper grava o papel de verdade antes de autenticar.
async function autenticarComo(cenario: Cenario, role = "OWNER") {
  // O papel precisa EXISTIR no vínculo, não só na sessão.
  await prisma.organizationMember.updateMany({
    where: { id: cenario.membro.id, organizationId: cenario.organization.id },
    data: { role: role as OrganizationRole },
  });

  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      name: "Quem Convida",
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const tokenDoLink = (link: string) => link.split("/").pop()!;

async function aceitar(token: string, senha?: string) {
  try {
    return await definirSenhaConvite(
      token,
      ESTADO_INICIAL_ACAO,
      senha ? formData({ senha }) : new FormData()
    );
  } catch (erro) {
    if (erro && typeof erro === "object" && "digest" in erro) return { success: true };
    throw erro;
  }
}

describe("convidar", () => {
  test("pessoa nova: nasce sem senha utilizável, vínculo INVITED e convite enviado", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario);
    const email = `novo-${Date.now()}@e2e.test`;

    const estado = await convidarUsuario(
      ESTADO_INICIAL_ACAO,
      formData({ nome: "Pessoa Nova", email, papel: "BROKER" })
    );
    expect(estado.success).toBe(true);

    const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
    usuariosAvulsos.push(usuario.id);
    // active:false é a barreira: auth.ts recusa login antes mesmo de
    // comparar senha. E a senha gravada é um valor aleatório que ninguém
    // digitou — não existe "senha temporária" recuperável em lugar nenhum.
    expect(usuario.active).toBe(false);
    expect(await bcrypt.compare("", usuario.passwordHash)).toBe(false);

    const vinculo = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, userId: usuario.id },
    });
    expect(vinculo.status).toBe("INVITED");
    expect(vinculo.role).toBe("BROKER");
    expect(convitesEnviados).toHaveLength(1);
    expect(convitesEnviados[0].jaTemConta).toBe(false);
  });

  test("o token bruto não é persistido — o banco guarda o sha256", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario);
    const email = `hash-${Date.now()}@e2e.test`;
    await convidarUsuario(ESTADO_INICIAL_ACAO, formData({ nome: "Hash", email, papel: "BROKER" }));

    const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
    usuariosAvulsos.push(usuario.id);
    const bruto = tokenDoLink(convitesEnviados[0].link);
    const registro = await prisma.inviteToken.findFirstOrThrow({ where: { userId: usuario.id } });

    expect(registro.tokenHash).toBe(hashToken(bruto));
    expect(JSON.stringify(registro)).not.toContain(bruto);
  });

  test("usuário que JÁ existe em outra organização ganha vínculo novo, sem segunda identidade", async () => {
    const outra = await novoCenario();
    const cenario = await novoCenario();
    const existente = await criarUsuario({ email: `multi-${Date.now()}@e2e.test` });
    usuariosAvulsos.push(existente.id);
    await criarMembro({
      organizationId: outra.organization.id,
      userId: existente.id,
      role: "BROKER",
    });

    await autenticarComo(cenario);
    const estado = await convidarUsuario(
      ESTADO_INICIAL_ACAO,
      formData({ nome: "Nome Digitado Pelo Admin", email: existente.email, papel: "MANAGER" })
    );
    expect(estado.success).toBe(true);

    // UMA identidade global, dois vínculos.
    expect(await prisma.user.count({ where: { email: existente.email } })).toBe(1);
    expect(await prisma.organizationMember.count({ where: { userId: existente.id } })).toBe(2);

    // O nome digitado por quem convida é IGNORADO para usuário
    // existente: um admin não renomeia alguém em todas as outras
    // imobiliárias onde essa pessoa trabalha.
    const usuario = await prisma.user.findUniqueOrThrow({ where: { id: existente.id } });
    expect(usuario.name).not.toBe("Nome Digitado Pelo Admin");
    // E já tem conta: o e-mail diz para aceitar, não para criar senha.
    expect(convitesEnviados[0].jaTemConta).toBe(true);
  });

  test("existência do e-mail em OUTRA organização não é revelada por mensagem de erro", async () => {
    const outra = await novoCenario();
    const cenario = await novoCenario();
    const existente = await criarUsuario({ email: `oraculo-${Date.now()}@e2e.test` });
    usuariosAvulsos.push(existente.id);
    await criarMembro({ organizationId: outra.organization.id, userId: existente.id, role: "BROKER" });

    await autenticarComo(cenario);
    const conhecido = await convidarUsuario(
      ESTADO_INICIAL_ACAO,
      formData({ nome: "Nome Valido", email: existente.email, papel: "BROKER" })
    );
    const desconhecido = await convidarUsuario(
      ESTADO_INICIAL_ACAO,
      formData({ nome: "Outro Nome", email: `outro-${Date.now()}@e2e.test`, papel: "BROKER" })
    );

    // Os dois convites simplesmente funcionam. Antes desta fase, o
    // primeiro devolvia "Já existe um usuário com esse e-mail" — um
    // oráculo de quem tem conta no produto inteiro.
    expect(conhecido.success).toBe(true);
    expect(desconhecido.success).toBe(true);
  });

  test("vínculo ACTIVE, INVITED e SUSPENDED têm respostas próprias e nenhum papel é sobrescrito", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario);
    const usuario = await criarUsuario({ email: `estados-${Date.now()}@e2e.test` });
    usuariosAvulsos.push(usuario.id);
    const vinculo = await criarMembro({
      organizationId: cenario.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });

    const ativo = await convidarUsuario(
      ESTADO_INICIAL_ACAO,
      formData({ nome: "Nome Valido", email: usuario.email, papel: "ADMIN" })
    );
    expect(ativo.success).toBe(false);

    await prisma.organizationMember.update({ where: { id: vinculo.id }, data: { status: "SUSPENDED" } });
    const suspenso = await convidarUsuario(
      ESTADO_INICIAL_ACAO,
      formData({ nome: "Nome Valido", email: usuario.email, papel: "ADMIN" })
    );
    expect(suspenso.success).toBe(false);
    // Convite NÃO reativa acesso suspenso — reativar é decisão própria.
    expect(
      (await prisma.organizationMember.findUniqueOrThrow({ where: { id: vinculo.id } })).status
    ).toBe("SUSPENDED");

    await prisma.organizationMember.update({ where: { id: vinculo.id }, data: { status: "INVITED" } });
    const convidado = await convidarUsuario(
      ESTADO_INICIAL_ACAO,
      formData({ nome: "Nome Valido", email: usuario.email, papel: "ADMIN" })
    );
    expect(convidado.success).toBe(false);

    // Em nenhum dos três o papel virou ADMIN por baixo dos panos.
    expect(
      (await prisma.organizationMember.findUniqueOrThrow({ where: { id: vinculo.id } })).role
    ).toBe("BROKER");
  });

  test("MANAGER não convida; BROKER não convida", async () => {
    const cenario = await novoCenario();
    for (const papel of ["MANAGER", "BROKER", "ASSISTANT"]) {
      await autenticarComo(cenario, papel);
      const estado = await convidarUsuario(
        ESTADO_INICIAL_ACAO,
        formData({ nome: "Terceiro Nome", email: `negado-${papel}-${Date.now()}@e2e.test`, papel: "BROKER" })
      );
      expect(estado.success).toBe(false);
    }
    expect(convitesEnviados).toHaveLength(0);
  });

  test("ADMIN não consegue criar um OWNER", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "ADMIN");
    const estado = await convidarUsuario(
      ESTADO_INICIAL_ACAO,
      formData({ nome: "Quer Ser Dono", email: `owner-${Date.now()}@e2e.test`, papel: "OWNER" })
    );
    expect(estado.success).toBe(false);
    expect(convitesEnviados).toHaveLength(0);
  });

  test("falha de e-mail deixa o convite VÁLIDO e reenviável, nunca um estado incoerente", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario);
    falharEnvio = true;
    const email = `sem-email-${Date.now()}@e2e.test`;

    const estado = await convidarUsuario(
      ESTADO_INICIAL_ACAO,
      formData({ nome: "Sem E-mail", email, papel: "BROKER" })
    );

    // Sucesso com ressalva: o convite EXISTE — o que faltou foi a
    // entrega, e ela pode ser repetida.
    expect(estado.success).toBe(true);
    expect(estado.message).toContain("Reenviar");
    const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
    usuariosAvulsos.push(usuario.id);
    expect(await prisma.inviteToken.count({ where: { userId: usuario.id } })).toBe(1);
  });
});

describe("reenviar convite", () => {
  async function comConvitePendente() {
    const cenario = await novoCenario();
    await autenticarComo(cenario);
    const email = `pendente-${Date.now()}-${Math.random()}@e2e.test`;
    await convidarUsuario(ESTADO_INICIAL_ACAO, formData({ nome: "Pendente", email, papel: "BROKER" }));
    const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
    usuariosAvulsos.push(usuario.id);
    const vinculo = await prisma.organizationMember.findFirstOrThrow({ where: { userId: usuario.id } });
    return { cenario, usuario, vinculo, token: tokenDoLink(convitesEnviados[0].link) };
  }

  test("o convite anterior morre: nunca dois links válidos ao mesmo tempo", async () => {
    const { vinculo, token: primeiro } = await comConvitePendente();

    const estado = await reenviarConviteUsuario(vinculo.id, ESTADO_INICIAL_ACAO, new FormData());
    expect(estado.success).toBe(true);
    expect(convitesEnviados).toHaveLength(2);

    const segundo = tokenDoLink(convitesEnviados[1].link);
    expect(segundo).not.toBe(primeiro);

    // O primeiro link não abre mais nada.
    const comAntigo = await aceitar(primeiro, "senha-nova-123");
    expect(comAntigo.success).toBe(false);
    // O novo abre.
    const comNovo = await aceitar(segundo, "senha-nova-123");
    expect(comNovo.success).toBe(true);
  });

  test("dois reenvios simultâneos deixam no máximo um convite utilizável", async () => {
    const { vinculo, usuario } = await comConvitePendente();

    await Promise.allSettled([
      reenviarConviteUsuario(vinculo.id, ESTADO_INICIAL_ACAO, new FormData()),
      reenviarConviteUsuario(vinculo.id, ESTADO_INICIAL_ACAO, new FormData()),
    ]);

    const tokens = await prisma.inviteToken.findMany({
      where: { userId: usuario.id, usedAt: null },
    });
    expect(tokens.length).toBeLessThanOrEqual(1);
  });

  test("vínculo de OUTRA organização não é reenviável (IDOR)", async () => {
    const alvo = await comConvitePendente();
    const atacante = await novoCenario();
    await autenticarComo(atacante);

    const estado = await reenviarConviteUsuario(alvo.vinculo.id, ESTADO_INICIAL_ACAO, new FormData());

    expect(estado.success).toBe(false);
    expect(convitesEnviados).toHaveLength(1); // só o original
  });

  test("não há convite a reenviar para quem já está ativo", async () => {
    const { cenario, vinculo } = await comConvitePendente();
    await prisma.organizationMember.update({ where: { id: vinculo.id }, data: { status: "ACTIVE" } });
    await autenticarComo(cenario);

    const estado = await reenviarConviteUsuario(vinculo.id, ESTADO_INICIAL_ACAO, new FormData());
    expect(estado.success).toBe(false);
  });
});

describe("aceitação do convite", () => {
  async function comConvitePendente() {
    const cenario = await novoCenario();
    await autenticarComo(cenario);
    const email = `aceite-${Date.now()}-${Math.random()}@e2e.test`;
    await convidarUsuario(ESTADO_INICIAL_ACAO, formData({ nome: "Aceite", email, papel: "BROKER" }));
    const usuario = await prisma.user.findUniqueOrThrow({ where: { email } });
    usuariosAvulsos.push(usuario.id);
    return { cenario, usuario, token: tokenDoLink(convitesEnviados[0].link) };
  }

  test("define a senha, ativa a identidade e ativa o vínculo", async () => {
    const { cenario, usuario, token } = await comConvitePendente();

    const estado = await aceitar(token, "minha-senha-123");
    expect(estado.success).toBe(true);

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(depois.active).toBe(true);
    expect(await bcrypt.compare("minha-senha-123", depois.passwordHash)).toBe(true);

    const vinculo = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, userId: usuario.id },
    });
    expect(vinculo.status).toBe("ACTIVE");
  });

  test("replay: o mesmo link não ativa duas vezes", async () => {
    const { usuario, token } = await comConvitePendente();
    await aceitar(token, "primeira-123");

    const segunda = await definirSenhaConvite(token, ESTADO_INICIAL_ACAO, formData({ senha: "segunda-123" }));

    expect(segunda.success).toBe(false);
    const depois = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });
    // A senha continua sendo a da primeira aceitação.
    expect(await bcrypt.compare("primeira-123", depois.passwordHash)).toBe(true);
  });

  test("duas aceitações simultâneas: só uma efetiva", async () => {
    const { usuario, token } = await comConvitePendente();

    await Promise.allSettled([aceitar(token, "corrida-a-123"), aceitar(token, "corrida-b-123")]);

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });
    const a = await bcrypt.compare("corrida-a-123", depois.passwordHash);
    const b = await bcrypt.compare("corrida-b-123", depois.passwordHash);
    expect(a !== b).toBe(true);
  });

  test("convite expirado é recusado", async () => {
    const { usuario, token } = await comConvitePendente();
    await prisma.inviteToken.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const estado = await definirSenhaConvite(token, ESTADO_INICIAL_ACAO, formData({ senha: "tarde-demais-123" }));
    expect(estado.success).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } })).active).toBe(false);
  });

  test("usuário que já tem conta aceita o vínculo SEM trocar a própria senha", async () => {
    const outra = await novoCenario();
    const cenario = await novoCenario();
    const existente = await criarUsuario({
      email: `ja-tem-${Date.now()}@e2e.test`,
      senha: "senha-original-123",
    });
    usuariosAvulsos.push(existente.id);
    await criarMembro({ organizationId: outra.organization.id, userId: existente.id, role: "BROKER" });

    await autenticarComo(cenario);
    await convidarUsuario(
      ESTADO_INICIAL_ACAO,
      formData({ nome: "Nome Valido", email: existente.email, papel: "MANAGER" })
    );
    const estado = await aceitar(tokenDoLink(convitesEnviados[0].link));
    expect(estado.success).toBe(true);

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: existente.id } });
    // A senha continua sendo a dela. Entrar numa segunda imobiliária não
    // dá a ninguém o poder de forçar troca de senha alheia.
    expect(await bcrypt.compare("senha-original-123", depois.passwordHash)).toBe(true);
    expect(depois.passwordChangedAt).toBeNull();

    const novoVinculo = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, userId: existente.id },
    });
    expect(novoVinculo.status).toBe("ACTIVE");
    expect(novoVinculo.role).toBe("MANAGER");
  });

  test("convite revogado no meio do caminho não ativa vínculo nenhum", async () => {
    const { cenario, usuario, token } = await comConvitePendente();
    // O admin removeu o vínculo depois de convidar.
    await prisma.organizationMember.deleteMany({
      where: { organizationId: cenario.organization.id, userId: usuario.id },
    });

    await aceitar(token, "senha-tardia-123");

    expect(
      await prisma.organizationMember.count({
        where: { organizationId: cenario.organization.id, userId: usuario.id },
      })
    ).toBe(0);
  });
});

// =======================================================================
// Seleção de organização no login (Fase 25)
// =======================================================================
// Convidar alguém que já tem conta cria um SEGUNDO vínculo ativo. A
// partir daí, "em qual organização essa pessoa entra?" deixou de ser
// hipotética — e a resposta precisa ser sempre a mesma.
describe("login de quem pertence a duas organizações", () => {
  test("entra sempre na organização mais antiga, independente de convites novos", async () => {
    const primeira = await novoCenario();
    const segunda = await novoCenario();

    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    await criarMembro({
      organizationId: primeira.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });
    await criarMembro({
      organizationId: segunda.organization.id,
      userId: usuario.id,
      role: "MANAGER",
    });

    // A MESMA consulta que auth.ts faz para decidir o tenant do login.
    // Repetida várias vezes: sem orderBy explícito o Postgres pode
    // devolver os vínculos em ordem diferente a cada chamada, e a pessoa
    // cairia em organizações distintas em logins sucessivos — sem nada
    // na tela explicando por quê.
    const escolhas = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const vinculo = await prisma.organizationMember.findFirst({
        where: { userId: usuario.id, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: { organizationId: true },
      });
      escolhas.add(vinculo!.organizationId);
    }

    expect(escolhas.size).toBe(1);
    // E a escolhida é onde a pessoa já trabalhava: aceitar um convite
    // novo não muda para onde ela entra.
    expect([...escolhas][0]).toBe(primeira.organization.id);
  });
});
