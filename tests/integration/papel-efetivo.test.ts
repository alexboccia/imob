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
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect:${destino}`);
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { criarCenario, criarUsuario, criarMembro } from "@/test/fixtures";
import { papelAtual } from "@/lib/papel-atual";
import { temPapel, PAPEIS_GESTAO_USUARIOS } from "@/lib/authorization";
import { salvarConfiguracaoContato } from "@/app/app/configuracoes/actions";

// =======================================================================
// Papel efetivo (Fase 27) — o JWT não é autoridade de privilégio
// =======================================================================
// A vulnerabilidade que estes testes fecham: rebaixar um membro não
// tirava privilégio nenhum até a sessão expirar, porque toda
// autorização lia o papel do token.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
const usuariosAvulsos: string[] = [];

afterEach(async () => {
  vi.mocked(auth).mockReset();
  for (const id of usuariosAvulsos.splice(0)) {
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

// A sessão carrega o papel que o JWT tinha NA EMISSÃO — é justamente
// esse valor que não pode mais valer como autoridade.
function sessaoComPapelDoToken(cenario: Cenario, userId: string, membroId: string, papelNoToken: string) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: userId,
      organizationId: cenario.organization.id,
      organizationMemberId: membroId,
      role: papelNoToken,
      emitidaEm: Math.floor(Date.now() / 1000),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe("papel efetivo vem do vínculo, não do token", () => {
  test("OWNER rebaixado para BROKER perde o privilégio NA MESMA SESSÃO", async () => {
    const cenario = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    const membro = await criarMembro({
      organizationId: cenario.organization.id,
      userId: usuario.id,
      role: "OWNER",
    });

    // Sessão emitida enquanto ainda era OWNER.
    sessaoComPapelDoToken(cenario, usuario.id, membro.id, "OWNER");
    expect(await papelAtual()).toBe("OWNER");
    expect(temPapel(await papelAtual(), PAPEIS_GESTAO_USUARIOS)).toBe(true);

    // Rebaixado no banco. Nenhuma sessão nova é emitida — o token
    // continua dizendo OWNER.
    await prisma.organizationMember.update({
      where: { id: membro.id },
      data: { role: "BROKER" },
    });

    // O token ainda mente...
    const session = await auth();
    expect(session!.user.role).toBe("OWNER");

    // ...mas a autoridade é o vínculo.
    expect(await papelAtual()).toBe("BROKER");
    expect(temPapel(await papelAtual(), PAPEIS_GESTAO_USUARIOS)).toBe(false);
  });

  test("vínculo suspenso não conserva papel nenhum", async () => {
    const cenario = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    const membro = await criarMembro({
      organizationId: cenario.organization.id,
      userId: usuario.id,
      role: "OWNER",
    });
    sessaoComPapelDoToken(cenario, usuario.id, membro.id, "OWNER");

    await prisma.organizationMember.update({
      where: { id: membro.id },
      data: { status: "SUSPENDED" },
    });

    // Falha fechado: quem perdeu o acesso não conserva capacidade.
    expect(await papelAtual()).toBeUndefined();
    expect(temPapel(await papelAtual(), PAPEIS_GESTAO_USUARIOS)).toBe(false);
  });

  test("vínculo removido não conserva papel nenhum", async () => {
    const cenario = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    const membro = await criarMembro({
      organizationId: cenario.organization.id,
      userId: usuario.id,
      role: "OWNER",
    });
    sessaoComPapelDoToken(cenario, usuario.id, membro.id, "OWNER");

    await prisma.organizationMember.delete({ where: { id: membro.id } });

    expect(await papelAtual()).toBeUndefined();
  });

  test("multi-org: o papel é o da organização ATUAL, nunca o da outra", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    const membroA = await criarMembro({
      organizationId: orgA.organization.id,
      userId: usuario.id,
      role: "OWNER",
    });
    const membroB = await criarMembro({
      organizationId: orgB.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });

    sessaoComPapelDoToken(orgA, usuario.id, membroA.id, "OWNER");
    expect(await papelAtual()).toBe("OWNER");

    // Sessão apontando para B. Mesmo que o token trouxesse OWNER por
    // engano, o papel efetivo é o de B.
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: usuario.id,
        organizationId: orgB.organization.id,
        organizationMemberId: membroB.id,
        role: "OWNER",
        emitidaEm: Math.floor(Date.now() / 1000),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(await papelAtual()).toBe("BROKER");
    expect(temPapel(await papelAtual(), PAPEIS_GESTAO_USUARIOS)).toBe(false);
  });

  test("promoção também vale na mesma sessão", async () => {
    const cenario = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    const membro = await criarMembro({
      organizationId: cenario.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });
    sessaoComPapelDoToken(cenario, usuario.id, membro.id, "BROKER");
    expect(temPapel(await papelAtual(), PAPEIS_GESTAO_USUARIOS)).toBe(false);

    await prisma.organizationMember.update({
      where: { id: membro.id },
      data: { role: "ADMIN" },
    });

    // A revalidação vale nos dois sentidos: não é só punição, é a
    // verdade atual do vínculo.
    expect(temPapel(await papelAtual(), PAPEIS_GESTAO_USUARIOS)).toBe(true);
  });

  test("sem sessão, não há papel", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(null as any);
    expect(await papelAtual()).toBeUndefined();
  });

  // =====================================================================
  // A regressão que importa: atravessando uma Server Action REAL
  // =====================================================================
  // Server Action é fronteira de segurança. Provar a correção só no
  // helper deixaria de fora justamente o lugar onde a decisão vale — e
  // era exatamente ali (sete arquivos de action) que a role do token
  // decidia.
  test("OWNER rebaixado para BROKER tem a Server Action NEGADA na mesma sessão", async () => {
    const cenario = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    const membro = await criarMembro({
      organizationId: cenario.organization.id,
      userId: usuario.id,
      role: "OWNER",
    });
    sessaoComPapelDoToken(cenario, usuario.id, membro.id, "OWNER");

    const formulario = () => {
      const fd = new FormData();
      fd.set("themeId", "classic-blue");
      fd.set("footerAparencia", "AUTO");
      fd.set("timezone", "America/Sao_Paulo");
      fd.set("visibilidadeComercial", "COLLABORATIVE");
      return fd;
    };

    // Como OWNER de verdade, a ação passa.
    const comoOwner = await salvarConfiguracaoContato(
      { success: false, message: "" },
      formulario()
    );
    expect(comoOwner.success).toBe(true);

    // Rebaixado no banco. NENHUMA sessão nova é emitida — o JWT continua
    // dizendo OWNER, e continuaria dizendo por até 30 dias (maxAge padrão
    // do Auth.js, confirmado em @auth/core/lib/init.js).
    await prisma.organizationMember.update({
      where: { id: membro.id },
      data: { role: "BROKER" },
    });

    const depoisDoRebaixamento = await salvarConfiguracaoContato(
      { success: false, message: "" },
      formulario()
    );

    // Antes desta fase isto passava: a action lia session.user.role.
    expect(depoisDoRebaixamento.success).toBe(false);
  });

  test("BROKER promovido a ADMIN passa a poder na mesma sessão, sem novo login", async () => {
    const cenario = await novoCenario();
    const usuario = await criarUsuario();
    usuariosAvulsos.push(usuario.id);
    const membro = await criarMembro({
      organizationId: cenario.organization.id,
      userId: usuario.id,
      role: "BROKER",
    });
    // O token diz BROKER e continuará dizendo.
    sessaoComPapelDoToken(cenario, usuario.id, membro.id, "BROKER");

    const formulario = () => {
      const fd = new FormData();
      fd.set("themeId", "classic-blue");
      fd.set("footerAparencia", "AUTO");
      fd.set("timezone", "UTC");
      fd.set("visibilidadeComercial", "COLLABORATIVE");
      return fd;
    };

    expect((await salvarConfiguracaoContato({ success: false, message: "" }, formulario())).success).toBe(
      false
    );

    await prisma.organizationMember.update({
      where: { id: membro.id },
      data: { role: "ADMIN" },
    });

    // A revalidação vale nos dois sentidos, e sem exigir logout/login: a
    // autorização é sobre quem a pessoa É agora, não sobre quem ela era
    // quando o token foi emitido.
    expect((await salvarConfiguracaoContato({ success: false, message: "" }, formulario())).success).toBe(
      true
    );
  });
});
