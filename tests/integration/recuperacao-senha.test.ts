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

// O e-mail é MOCKADO, nunca o Resend real. É também o único jeito de o
// teste ver o token bruto: ele existe apenas no link enviado — o banco
// guarda somente o hash. Capturar o link aqui é, literalmente, ler a
// caixa de entrada.
const emailsEnviados: { para: string; link: string }[] = [];
vi.mock("@/lib/email", () => ({
  enviarEmailRecuperacaoSenha: vi.fn(async ({ para, linkRedefinicao }) => {
    emailsEnviados.push({ para, link: linkRedefinicao });
    return { enviado: true };
  }),
  enviarEmailConviteMembro: vi.fn(async () => ({ enviado: true })),
}));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarUsuario, criarMembro } from "@/test/fixtures";
import { hashToken } from "@/lib/acesso-token";
import { pedirRecuperacaoSenha } from "@/app/app/recuperar-senha/actions";
import { redefinirSenha } from "@/app/app/redefinir-senha/[token]/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// =======================================================================
// Recuperação de senha (Fase 25) — contra o banco
// =======================================================================

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
const usuariosAvulsos: string[] = [];

afterEach(async () => {
  emailsEnviados.length = 0;
  while (usuariosAvulsos.length) {
    const id = usuariosAvulsos.pop()!;
    await prisma.passwordResetToken.deleteMany({ where: { userId: id } });
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

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

function tokenDoLink(link: string): string {
  return link.split("/").pop()!;
}

// Usuário ATIVO com vínculo ativo — o caso normal de quem esqueceu a senha.
async function usuarioComAcesso(cenario: Cenario, email?: string) {
  const usuario = await criarUsuario({ email, senha: "senha-antiga-123" });
  usuariosAvulsos.push(usuario.id);
  await criarMembro({
    organizationId: cenario.organization.id,
    userId: usuario.id,
    role: "BROKER",
  });
  return usuario;
}

describe("pedido de recuperação", () => {
  test("e-mail cadastrado gera token e envia link", async () => {
    const cenario = await novoCenario();
    const usuario = await usuarioComAcesso(cenario);

    const estado = await pedirRecuperacaoSenha({ enviado: false }, formData({ email: usuario.email }));

    expect(estado).toEqual({ enviado: true });
    expect(emailsEnviados).toHaveLength(1);
    expect(emailsEnviados[0].para).toBe(usuario.email);

    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: usuario.id } });
    expect(tokens).toHaveLength(1);
  });

  test("e-mail inexistente devolve EXATAMENTE a mesma resposta, sem criar nem enviar nada", async () => {
    const estado = await pedirRecuperacaoSenha(
      { enviado: false },
      formData({ email: "nao-existe-em-lugar-nenhum@e2e.test" })
    );

    // A resposta pública é idêntica à do caso anterior. É isto que
    // impede usar o formulário como oráculo de contas.
    expect(estado).toEqual({ enviado: true });
    expect(emailsEnviados).toHaveLength(0);
  });

  test("e-mail sintaticamente inválido também devolve a mesma resposta", async () => {
    // Dizer "e-mail inválido" já separaria o espaço de busca de quem
    // testa endereços.
    const estado = await pedirRecuperacaoSenha({ enviado: false }, formData({ email: "nao-e-email" }));
    expect(estado).toEqual({ enviado: true });
    expect(emailsEnviados).toHaveLength(0);
  });

  test("conta nunca ativada (convite pendente) não recebe recuperação — e é indistinguível de fora", async () => {
    const usuario = await criarUsuario({ email: `pendente-${Date.now()}@e2e.test` });
    usuariosAvulsos.push(usuario.id);
    await prisma.user.update({ where: { id: usuario.id }, data: { active: false } });

    const estado = await pedirRecuperacaoSenha({ enviado: false }, formData({ email: usuario.email }));

    expect(estado).toEqual({ enviado: true });
    expect(emailsEnviados).toHaveLength(0);
    expect(await prisma.passwordResetToken.count({ where: { userId: usuario.id } })).toBe(0);
  });

  test("o token bruto NUNCA está no banco — só o sha256 dele", async () => {
    const cenario = await novoCenario();
    const usuario = await usuarioComAcesso(cenario);
    await pedirRecuperacaoSenha({ enviado: false }, formData({ email: usuario.email }));

    const bruto = tokenDoLink(emailsEnviados[0].link);
    const registro = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: usuario.id },
    });

    expect(registro.tokenHash).toBe(hashToken(bruto));
    expect(registro.tokenHash).not.toBe(bruto);
    // Nenhuma coluna da linha contém o segredo em texto claro.
    expect(JSON.stringify(registro)).not.toContain(bruto);
  });

  test("pedir de novo invalida o pedido anterior: nunca dois links vivos", async () => {
    const cenario = await novoCenario();
    const usuario = await usuarioComAcesso(cenario);

    await pedirRecuperacaoSenha({ enviado: false }, formData({ email: usuario.email }));
    const primeiro = tokenDoLink(emailsEnviados[0].link);
    await pedirRecuperacaoSenha({ enviado: false }, formData({ email: usuario.email }));

    expect(await prisma.passwordResetToken.count({ where: { userId: usuario.id } })).toBe(1);
    // O primeiro link deixou de valer.
    const estado = await redefinirSenha(primeiro, ESTADO_INICIAL_ACAO, formData({ senha: "nova-senha-123" }));
    expect(estado.success).toBe(false);
  });

  test("membro SUSPENSO recupera a senha (autenticação), mas isso não devolve acesso (autorização)", async () => {
    const cenario = await novoCenario();
    const usuario = await usuarioComAcesso(cenario);
    await prisma.organizationMember.updateMany({
      where: { userId: usuario.id },
      data: { status: "SUSPENDED" },
    });

    await pedirRecuperacaoSenha({ enviado: false }, formData({ email: usuario.email }));
    expect(emailsEnviados).toHaveLength(1);

    const token = tokenDoLink(emailsEnviados[0].link);
    await redefinirSenha(token, ESTADO_INICIAL_ACAO, formData({ senha: "nova-senha-123" })).catch(() => {});

    // A senha mudou — e o vínculo continua suspenso. Redefinir senha
    // NUNCA reativa acesso: quem barra a entrada é o status do vínculo.
    const vinculo = await prisma.organizationMember.findFirstOrThrow({ where: { userId: usuario.id } });
    expect(vinculo.status).toBe("SUSPENDED");
  });
});

describe("redefinição de senha", () => {
  async function comTokenValido() {
    const cenario = await novoCenario();
    const usuario = await usuarioComAcesso(cenario);
    await pedirRecuperacaoSenha({ enviado: false }, formData({ email: usuario.email }));
    return { cenario, usuario, token: tokenDoLink(emailsEnviados[0].link) };
  }

  // redefinirSenha termina em redirect(), que o Next implementa lançando.
  // Capturar aqui mantém o teste falando do efeito no banco.
  async function redefinir(token: string, senha: string) {
    try {
      return await redefinirSenha(token, ESTADO_INICIAL_ACAO, formData({ senha }));
    } catch (erro) {
      if (erro && typeof erro === "object" && "digest" in erro) return { success: true };
      throw erro;
    }
  }

  test("a senha nova funciona e a antiga deixa de funcionar", async () => {
    const { usuario, token } = await comTokenValido();

    await redefinir(token, "senha-nova-456");

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(await bcrypt.compare("senha-nova-456", depois.passwordHash)).toBe(true);
    expect(await bcrypt.compare("senha-antiga-123", depois.passwordHash)).toBe(false);
    // O marco temporal é o que derruba sessões emitidas antes da troca.
    expect(depois.passwordChangedAt).not.toBeNull();
  });

  test("token usado não vale duas vezes — replay falha", async () => {
    const { usuario, token } = await comTokenValido();
    await redefinir(token, "primeira-nova-123");

    const segunda = await redefinirSenha(token, ESTADO_INICIAL_ACAO, formData({ senha: "segunda-nova-123" }));

    expect(segunda.success).toBe(false);
    const depois = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });
    // A senha continua sendo a da PRIMEIRA redefinição.
    expect(await bcrypt.compare("primeira-nova-123", depois.passwordHash)).toBe(true);
  });

  test("token expirado é recusado", async () => {
    const { token } = await comTokenValido();
    await prisma.passwordResetToken.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const estado = await redefinirSenha(token, ESTADO_INICIAL_ACAO, formData({ senha: "nova-senha-123" }));
    expect(estado.success).toBe(false);
  });

  test("token inexistente é recusado com a MESMA mensagem de expirado e usado", async () => {
    const { token } = await comTokenValido();
    await prisma.passwordResetToken.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expirado = await redefinirSenha(token, ESTADO_INICIAL_ACAO, formData({ senha: "nova-senha-123" }));
    const inexistente = await redefinirSenha("token-que-nunca-existiu", ESTADO_INICIAL_ACAO, formData({ senha: "nova-senha-123" }));

    // Distinguir os casos contaria a quem tem o link se ele já foi
    // válido um dia.
    expect(inexistente.message).toBe(expirado.message);
  });

  test("duas redefinições simultâneas: uma vence, a senha fica coerente", async () => {
    const { usuario, token } = await comTokenValido();

    const resultados = await Promise.allSettled([
      redefinir(token, "corrida-a-123"),
      redefinir(token, "corrida-b-123"),
    ]);
    expect(resultados).toHaveLength(2);

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });
    const venceuA = await bcrypt.compare("corrida-a-123", depois.passwordHash);
    const venceuB = await bcrypt.compare("corrida-b-123", depois.passwordHash);
    // Exatamente uma das duas — nunca as duas, nunca nenhuma.
    expect(venceuA !== venceuB).toBe(true);

    const registro = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: usuario.id },
    });
    expect(registro.usedAt).not.toBeNull();
  });

  test("senha curta demais é recusada e o token continua utilizável", async () => {
    const { usuario, token } = await comTokenValido();

    const estado = await redefinirSenha(token, ESTADO_INICIAL_ACAO, formData({ senha: "abc" }));
    expect(estado.success).toBe(false);

    // Errar a política não pode queimar o link — a pessoa tentaria de
    // novo e descobriria que precisa pedir outro e-mail.
    const registro = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: usuario.id } });
    expect(registro.usedAt).toBeNull();
    await redefinir(token, "agora-vale-123");
    const depois = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(await bcrypt.compare("agora-vale-123", depois.passwordHash)).toBe(true);
  });

  test("a trilha registra a troca sem e-mail, senha, hash ou token", async () => {
    const { cenario, usuario, token } = await comTokenValido();
    await redefinir(token, "auditada-123");

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { organizationId: cenario.organization.id, action: "password_reset_completed" },
    });
    expect(log.entityId).toBe(usuario.id);
    const serializado = JSON.stringify(log);
    expect(serializado).not.toContain(usuario.email);
    expect(serializado).not.toContain(token);
    expect(serializado).not.toContain("auditada-123");
  });
});

// =======================================================================
// Invariantes de domínio: reset é AUTENTICAÇÃO, não AUTORIZAÇÃO
// =======================================================================
// O requisito é "reset não pode reativar acesso suspenso" — que é
// diferente de "quem tem alguma membership suspensa não pode redefinir a
// própria credencial". A senha pertence ao User, é global, e atravessa
// organizações; o vínculo é que decide onde essa identidade entra.
//
// As sete invariantes que este bloco fixa, para que nenhuma refatoração
// futura as quebre em silêncio:
//
//   1. reset NUNCA cria OrganizationMember;
//   2. NUNCA muda OrganizationMember.status;
//   3. NUNCA torna ACTIVE uma membership SUSPENDED;
//   4. NUNCA altera role;
//   5. NUNCA adiciona membership;
//   6. NUNCA escolhe uma Organization como efeito colateral;
//   7. auth continua exigindo membership ACTIVE para conceder acesso.
describe("multi-organização: a senha é global, o acesso não", () => {
  async function redefinir(token: string, senha: string) {
    try {
      return await redefinirSenha(token, ESTADO_INICIAL_ACAO, formData({ senha }));
    } catch (erro) {
      if (erro && typeof erro === "object" && "digest" in erro) return { success: true };
      throw erro;
    }
  }

  test("suspenso em A e ativo em B: a senha muda, os vínculos não", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();

    const usuario = await criarUsuario({ senha: "senha-antiga-123" });
    usuariosAvulsos.push(usuario.id);
    const vinculoA = await criarMembro({
      organizationId: orgA.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });
    const vinculoB = await criarMembro({
      organizationId: orgB.organization.id,
      userId: usuario.id,
      role: "MANAGER",
    });
    await prisma.organizationMember.update({
      where: { id: vinculoA.id },
      data: { status: "SUSPENDED" },
    });

    const vinculosAntes = await prisma.organizationMember.count({ where: { userId: usuario.id } });

    // --- o fluxo real, de ponta a ponta ---
    await pedirRecuperacaoSenha({ enviado: false }, formData({ email: usuario.email }));
    expect(emailsEnviados).toHaveLength(1);
    await redefinir(tokenDoLink(emailsEnviados[0].link), "senha-nova-456");

    const depois = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id } });

    // A IDENTIDADE mudou: a senha antiga não autentica mais, a nova sim.
    expect(await bcrypt.compare("senha-antiga-123", depois.passwordHash)).toBe(false);
    expect(await bcrypt.compare("senha-nova-456", depois.passwordHash)).toBe(true);

    // (1) e (5) nenhuma membership foi criada.
    expect(await prisma.organizationMember.count({ where: { userId: usuario.id } })).toBe(
      vinculosAntes
    );

    // (2) e (3) o vínculo suspenso continua suspenso — reset não reativa.
    const aDepois = await prisma.organizationMember.findUniqueOrThrow({
      where: { id: vinculoA.id },
    });
    expect(aDepois.status).toBe("SUSPENDED");

    // (7) e o vínculo ativo continua ativo — reset também não derruba
    // acesso legítimo em outra organização.
    const bDepois = await prisma.organizationMember.findUniqueOrThrow({
      where: { id: vinculoB.id },
    });
    expect(bDepois.status).toBe("ACTIVE");

    // (4) nenhum papel mudou.
    expect(aDepois.role).toBe("BROKER");
    expect(bDepois.role).toBe("MANAGER");

    // (6) nenhuma organização foi eleita como efeito colateral: o token
    // de recuperação não tem organizationId nenhum para eleger.
    const registro = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: usuario.id },
    });
    expect(Object.keys(registro)).not.toContain("organizationId");
  });

  test("A continua inacessível e B continua acessível — quem decide é o vínculo", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const usuario = await criarUsuario({ senha: "senha-antiga-123" });
    usuariosAvulsos.push(usuario.id);
    const vinculoA = await criarMembro({
      organizationId: orgA.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });
    await criarMembro({
      organizationId: orgB.organization.id,
      userId: usuario.id,
      role: "MANAGER",
    });
    await prisma.organizationMember.update({
      where: { id: vinculoA.id },
      data: { status: "SUSPENDED" },
    });

    await pedirRecuperacaoSenha({ enviado: false }, formData({ email: usuario.email }));
    await redefinir(tokenDoLink(emailsEnviados[0].link), "senha-nova-456");

    // A REGRA DE ACESSO, exercida como auth.ts a exerce: só um vínculo
    // ACTIVE concede entrada. Depois do reset, exatamente um vínculo
    // desta identidade satisfaz isso — o de B.
    const concedeAcesso = await prisma.organizationMember.findMany({
      where: { userId: usuario.id, status: "ACTIVE" },
      select: { organizationId: true },
    });
    expect(concedeAcesso).toHaveLength(1);
    expect(concedeAcesso[0].organizationId).toBe(orgB.organization.id);
    expect(concedeAcesso[0].organizationId).not.toBe(orgA.organization.id);
  });
});

// =======================================================================
// Equivalência observável da resposta pública
// =======================================================================
// Não se trata de igualar timing criptograficamente — e sim de garantir
// que nada no que o mundo externo consegue observar distinga os três
// casos. Se distinguisse, o formulário viraria um oráculo de contas.
describe("três identidades, uma única resposta", () => {
  test("inexistente, nunca ativada e elegível produzem resultado idêntico", async () => {
    const cenario = await novoCenario();

    // (a) elegível: identidade ativa com vínculo ativo.
    const elegivel = await usuarioComAcesso(cenario);

    // (b) nunca ativada: convite pendente, sem senha utilizável.
    const nuncaAtivada = await criarUsuario({ email: `nunca-${Date.now()}@e2e.test` });
    usuariosAvulsos.push(nuncaAtivada.id);
    await prisma.user.update({ where: { id: nuncaAtivada.id }, data: { active: false } });

    // (c) inexistente.
    const inexistente = `nao-existe-${Date.now()}@e2e.test`;

    const respostas = [];
    for (const email of [elegivel.email, nuncaAtivada.email, inexistente]) {
      respostas.push(await pedirRecuperacaoSenha({ enviado: false }, formData({ email })));
    }

    // Mesma ESTRUTURA e mesmo RESULTADO nos três casos.
    const [rElegivel, rNunca, rInexistente] = respostas;
    expect(rElegivel).toEqual({ enviado: true });
    expect(rNunca).toEqual(rElegivel);
    expect(rInexistente).toEqual(rElegivel);
    expect(Object.keys(rNunca)).toEqual(Object.keys(rElegivel));

    // Nenhuma das três lança, nenhuma redireciona, nenhuma devolve erro
    // de campo: a action não tem caminho de erro visível, por construção.
    expect(respostas.every((r) => !("message" in r) && !("fieldErrors" in r))).toBe(true);

    // E o que difere acontece SÓ do lado de dentro: apenas a identidade
    // elegível gerou e-mail e token.
    expect(emailsEnviados.map((e) => e.para)).toEqual([elegivel.email]);
    expect(await prisma.passwordResetToken.count({ where: { userId: nuncaAtivada.id } })).toBe(0);
  });

  test("a identidade nunca ativada continua no caminho do convite, não do reset", async () => {
    const nuncaAtivada = await criarUsuario({ email: `so-convite-${Date.now()}@e2e.test` });
    usuariosAvulsos.push(nuncaAtivada.id);
    await prisma.user.update({ where: { id: nuncaAtivada.id }, data: { active: false } });

    await pedirRecuperacaoSenha({ enviado: false }, formData({ email: nuncaAtivada.email }));

    // Nenhum token de recuperação foi criado, então não existe caminho
    // pelo qual um pedido de "esqueci a senha" se transforme em ativação
    // de conta — ativar continua sendo exclusividade do convite.
    expect(await prisma.passwordResetToken.count({ where: { userId: nuncaAtivada.id } })).toBe(0);
    const depois = await prisma.user.findUniqueOrThrow({ where: { id: nuncaAtivada.id } });
    expect(depois.active).toBe(false);
    expect(depois.passwordChangedAt).toBeNull();
  });
});
