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
import { criarCenario, criarImovel } from "@/test/fixtures";
import type { OrganizationRole } from "@/generated/prisma/client";
import { MAX_DESTAQUES_HOME } from "@/lib/vitrine-home";
import {
  buscarDestaquesDaHome,
  buscarOcupacaoVitrine,
} from "@/lib/vitrine-home-consultas";
import { atualizarImovel } from "@/app/app/imoveis/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// =======================================================================
// Vitrine editorial da Home — "Imóveis em destaque"
// =======================================================================
// Até quatro imóveis escolhidos pela imobiliária, em ordem definida por
// ela, exibidos apenas enquanto estiverem publicamente elegíveis.

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

// FIDELIDADE DE FIXTURE (Fase 27): o papel afirmado tem de existir no
// vínculo, porque a autorização lê o vínculo.
async function autenticarComo(cenario: Cenario, role: OrganizationRole = "OWNER") {
  await prisma.organizationMember.updateMany({
    where: { id: cenario.membro.id, organizationId: cenario.organization.id },
    data: { role },
  });
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role,
      emitidaEm: Math.floor(Date.now() / 1000),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// Devolve id E título porque o formulário da action exige o título — o
// fixture só devolve o id.
async function imovelDisponivel(
  cenario: Cenario,
  titulo: string
): Promise<{ id: string; title: string }> {
  const imovel = await criarImovel({ organizationId: cenario.organization.id, title: titulo });
  await prisma.property.updateMany({
    where: { id: imovel.id, organizationId: cenario.organization.id },
    data: { status: "AVAILABLE" },
  });
  return { id: imovel.id, title: titulo };
}

// Grava a posição direto, para montar cenários de leitura sem passar
// pelo formulário inteiro.
async function definirPosicao(
  cenario: Cenario,
  imovelId: string,
  posicao: number | null
) {
  await prisma.property.updateMany({
    where: { id: imovelId, organizationId: cenario.organization.id },
    data: { homeHighlightPosition: posicao },
  });
}

const idsDaHome = async (organizationId: string) =>
  (await buscarDestaquesDaHome(organizationId, { id: true, title: true })) as {
    id: string;
    title: string;
  }[];

describe("quantos aparecem", () => {
  test("zero destaques: a Home não recebe nada — nunca preenchida automaticamente", async () => {
    const cenario = await novoCenario();
    // Existem imóveis disponíveis, e mesmo assim a vitrine é vazia:
    // vitrine é escolha, e ninguém escolheu.
    await imovelDisponivel(cenario, "Disponível sem destaque");

    expect(await idsDaHome(cenario.organization.id)).toHaveLength(0);
  });

  test.each([1, 2, 3, 4])("com %i selecionados, a Home mostra exatamente %i", async (quantos) => {
    const cenario = await novoCenario();
    for (let i = 1; i <= quantos; i++) {
      const imovel = await imovelDisponivel(cenario, `Imóvel ${i}`);
      await definirPosicao(cenario, imovel.id, i);
    }

    // Nunca completa até quatro com imóveis aleatórios.
    expect(await idsDaHome(cenario.organization.id)).toHaveLength(quantos);
  });

  test("a ordem é a das posições, não a data de cadastro", async () => {
    const cenario = await novoCenario();
    // Criados em ordem inversa à que devem aparecer.
    const quarto = await imovelDisponivel(cenario, "Quarto");
    const primeiro = await imovelDisponivel(cenario, "Primeiro");
    await definirPosicao(cenario, quarto.id, 4);
    await definirPosicao(cenario, primeiro.id, 1);

    const home = await idsDaHome(cenario.organization.id);
    expect(home.map((i) => i.title)).toEqual(["Primeiro", "Quarto"]);
  });

  test("mudar a posição muda a ordem", async () => {
    const cenario = await novoCenario();
    const a = await imovelDisponivel(cenario, "A");
    const b = await imovelDisponivel(cenario, "B");
    await definirPosicao(cenario, a.id, 1);
    await definirPosicao(cenario, b.id, 2);
    expect((await idsDaHome(cenario.organization.id)).map((i) => i.title)).toEqual(["A", "B"]);

    // Troca: A sai da vitrine, B assume a primeira posição.
    await definirPosicao(cenario, a.id, null);
    await definirPosicao(cenario, b.id, 1);

    expect((await idsDaHome(cenario.organization.id)).map((i) => i.title)).toEqual(["B"]);
  });
});

describe("elegibilidade pública", () => {
  test("selecionado mas NÃO publicado não aparece — e mantém a seleção", async () => {
    const cenario = await novoCenario();
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await definirPosicao(cenario, imovel.id, 1);
    // Rascunho: a publicação continua sendo o portão, e a vitrine não o
    // enfraquece.
    await prisma.property.updateMany({
      where: { id: imovel.id, organizationId: cenario.organization.id },
      data: { status: "DRAFT" },
    });

    expect(await idsDaHome(cenario.organization.id)).toHaveLength(0);

    // A decisão editorial sobrevive: publicar de volta devolve o imóvel
    // à vitrine, sem ninguém reconfigurar nada.
    await prisma.property.updateMany({
      where: { id: imovel.id, organizationId: cenario.organization.id },
      data: { status: "AVAILABLE" },
    });
    expect(await idsDaHome(cenario.organization.id)).toHaveLength(1);
  });

  test("imóvel vendido some da vitrine sem perder a posição", async () => {
    const cenario = await novoCenario();
    const imovel = await imovelDisponivel(cenario, "Vendido depois");
    await definirPosicao(cenario, imovel.id, 2);
    expect(await idsDaHome(cenario.organization.id)).toHaveLength(1);

    await prisma.property.updateMany({
      where: { id: imovel.id, organizationId: cenario.organization.id },
      data: { status: "SOLD" },
    });

    expect(await idsDaHome(cenario.organization.id)).toHaveLength(0);
    // Selecionado e elegível são coisas separadas: a venda não apaga a
    // escolha editorial.
    const depois = await prisma.property.findFirstOrThrow({
      where: { id: imovel.id, organizationId: cenario.organization.id },
    });
    expect(depois.homeHighlightPosition).toBe(2);
    // E a posição continua ocupada para quem for configurar.
    const ocupacao = await buscarOcupacaoVitrine(cenario.organization.id);
    expect(ocupacao.find((o) => o.posicao === 2)?.imovel?.id).toBe(imovel.id);
  });
});

describe("isolamento entre imobiliárias", () => {
  test("cada organização tem a própria vitrine de quatro", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();

    for (let i = 1; i <= MAX_DESTAQUES_HOME; i++) {
      const a = await imovelDisponivel(orgA, `A${i}`);
      await definirPosicao(orgA, a.id, i);
      const b = await imovelDisponivel(orgB, `B${i}`);
      await definirPosicao(orgB, b.id, i);
    }

    // A posição 1 existe nas duas, sem colidir: o índice único é por
    // (organização, posição).
    const homeA = await idsDaHome(orgA.organization.id);
    const homeB = await idsDaHome(orgB.organization.id);
    expect(homeA).toHaveLength(4);
    expect(homeB).toHaveLength(4);
    expect(homeA.every((i) => i.title.startsWith("A"))).toBe(true);
    expect(homeB.every((i) => i.title.startsWith("B"))).toBe(true);
  });

  test("a Home de uma organização nunca mostra imóvel da outra", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const b = await imovelDisponivel(orgB, "Só de B");
    await definirPosicao(orgB, b.id, 1);

    expect(await idsDaHome(orgA.organization.id)).toHaveLength(0);
  });
});

// =======================================================================
// Mutação: teto, ordem, tenant e concorrência
// =======================================================================
// Tudo passa pela action REAL de edição de imóvel — a superfície onde a
// escolha acontece de verdade.

function formularioImovel(
  imovel: { title: string },
  extras: Record<string, string> = {}
): FormData {
  const fd = new FormData();
  fd.set("titulo", imovel.title);
  fd.set("tipo", "Apartamento");
  fd.set("finalidade", "SALE");
  fd.set("status", "AVAILABLE");
  fd.set("bairro", "Centro");
  fd.set("cidade", "São Paulo");
  fd.set("estado", "SP");
  fd.set("midiasJson", "[]");
  for (const [chave, valor] of Object.entries(extras)) fd.set(chave, valor);
  return fd;
}

// A action redireciona em DOIS casos muito diferentes: para a ficha do
// imóvel quando salvou, e para o login quando a sessão deixou de valer.
// Tratar os dois como "sucesso" esconderia exatamente o que o teste de
// vínculo suspenso precisa observar — por isso o destino é devolvido.
async function editar(
  imovelId: string,
  formData: FormData
): Promise<{ success: boolean; message?: string; destino?: string }> {
  try {
    return await atualizarImovel(imovelId, ESTADO_INICIAL_ACAO, formData);
  } catch (erro) {
    if (erro instanceof Error && erro.message.startsWith("redirect:")) {
      const destino = erro.message.slice("redirect:".length);
      return { success: !destino.startsWith("/app/login"), destino };
    }
    throw erro;
  }
}

describe("escolher pela tela de edição", () => {
  test("selecionar coloca na vitrine; remover tira", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "OWNER");
    const imovel = await imovelDisponivel(cenario, "Escolhido");

    await editar(imovel.id, formularioImovel(imovel, { posicaoDestaqueHome: "1" }));
    expect(await idsDaHome(cenario.organization.id)).toHaveLength(1);

    // Remover libera a vaga para outro imóvel ocupar.
    await editar(imovel.id, formularioImovel(imovel, { posicaoDestaqueHome: "" }));
    expect(await idsDaHome(cenario.organization.id)).toHaveLength(0);
    const ocupacao = await buscarOcupacaoVitrine(cenario.organization.id);
    expect(ocupacao.find((o) => o.posicao === 1)?.imovel).toBeNull();
  });

  test("o quinto destaque não é estado possível — as posições acabam", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "OWNER");
    for (let i = 1; i <= MAX_DESTAQUES_HOME; i++) {
      const imovel = await imovelDisponivel(cenario, `Ocupa ${i}`);
      await editar(imovel.id, formularioImovel(imovel, { posicaoDestaqueHome: String(i) }));
    }
    expect(await idsDaHome(cenario.organization.id)).toHaveLength(4);

    // Um quinto imóvel só poderia pedir uma posição de 1 a 4 — todas
    // ocupadas — ou um valor fora da faixa, que é recusado.
    const quinto = await imovelDisponivel(cenario, "Quinto");
    const foraDaFaixa = await editar(
      quinto.id,
      formularioImovel(quinto, { posicaoDestaqueHome: "5" })
    );
    expect(foraDaFaixa.success).toBe(false);

    const ocupada = await editar(
      quinto.id,
      formularioImovel(quinto, { posicaoDestaqueHome: "1" })
    );
    expect(ocupada.success).toBe(false);
    // A mensagem diz DE QUEM é a vaga — ninguém é derrubado em silêncio.
    expect(ocupada.message).toContain("Ocupa 1");

    expect(await idsDaHome(cenario.organization.id)).toHaveLength(4);
  });

  test("duas requisições simultâneas pela mesma vaga: uma vence, a vitrine nunca passa de 4", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "OWNER");
    for (let i = 1; i <= 3; i++) {
      const imovel = await imovelDisponivel(cenario, `Fixo ${i}`);
      await editar(imovel.id, formularioImovel(imovel, { posicaoDestaqueHome: String(i) }));
    }

    const candidatoA = await imovelDisponivel(cenario, "Candidato A");
    const candidatoB = await imovelDisponivel(cenario, "Candidato B");

    // Ambos disputam a quarta posição ao mesmo tempo. A contagem em
    // memória não decide nada aqui: quem decide é o índice único.
    await Promise.allSettled([
      editar(candidatoA.id, formularioImovel(candidatoA, { posicaoDestaqueHome: "4" })),
      editar(candidatoB.id, formularioImovel(candidatoB, { posicaoDestaqueHome: "4" })),
    ]);

    const home = await idsDaHome(cenario.organization.id);
    expect(home).toHaveLength(4);
    const naQuarta = home.filter(
      (i) => i.title === "Candidato A" || i.title === "Candidato B"
    );
    expect(naQuarta).toHaveLength(1);
  });

  test("trocar a própria posição é permitido (não colide consigo mesmo)", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "OWNER");
    const imovel = await imovelDisponivel(cenario, "Move-se");

    await editar(imovel.id, formularioImovel(imovel, { posicaoDestaqueHome: "2" }));
    const trocou = await editar(
      imovel.id,
      formularioImovel(imovel, { posicaoDestaqueHome: "3" })
    );

    expect(trocou.success).toBe(true);
    const ocupacao = await buscarOcupacaoVitrine(cenario.organization.id);
    expect(ocupacao.find((o) => o.posicao === 2)?.imovel).toBeNull();
    expect(ocupacao.find((o) => o.posicao === 3)?.imovel?.id).toBe(imovel.id);
  });

  test("valor adulterado não vira remoção silenciosa", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "OWNER");
    const imovel = await imovelDisponivel(cenario, "Protegido");
    await editar(imovel.id, formularioImovel(imovel, { posicaoDestaqueHome: "1" }));

    const adulterado = await editar(
      imovel.id,
      formularioImovel(imovel, { posicaoDestaqueHome: "abc" })
    );

    expect(adulterado.success).toBe(false);
    // Continua na vitrine: um valor inesperado é erro, não "tire daqui".
    expect(await idsDaHome(cenario.organization.id)).toHaveLength(1);
  });
});

describe("tenant e autorização", () => {
  test("IDOR: não se destaca imóvel de outra imobiliária", async () => {
    const orgA = await novoCenario();
    const orgB = await novoCenario();
    const imovelDeB = await imovelDisponivel(orgB, "Imóvel de B");

    // Sessão da organização A tentando editar um imóvel de B.
    await autenticarComo(orgA, "OWNER");
    await expect(
      editar(imovelDeB.id, formularioImovel(imovelDeB, { posicaoDestaqueHome: "1" }))
    ).rejects.toThrow();

    // Nada mudou em B.
    const depois = await prisma.property.findFirstOrThrow({
      where: { id: imovelDeB.id, organizationId: orgB.organization.id },
    });
    expect(depois.homeHighlightPosition).toBeNull();
    expect(await idsDaHome(orgA.organization.id)).toHaveLength(0);
  });

  test("a política de edição de imóvel é preservada: qualquer vínculo ativo edita", async () => {
    // Achado da auditoria: editar imóvel hoje NÃO exige papel algum além
    // de vínculo ativo. A vitrine é um atributo do imóvel e segue a
    // mesma política — inventar um gate novo aqui mudaria uma regra que
    // ninguém pediu para mudar.
    const cenario = await novoCenario();
    await autenticarComo(cenario, "BROKER");
    const imovel = await imovelDisponivel(cenario, "Editado por corretor");

    const resultado = await editar(
      imovel.id,
      formularioImovel(imovel, { posicaoDestaqueHome: "1" })
    );

    expect(resultado.success).toBe(true);
    expect(await idsDaHome(cenario.organization.id)).toHaveLength(1);
  });

  test("vínculo suspenso não edita a vitrine, mesmo com o token dizendo OWNER", async () => {
    const cenario = await novoCenario();
    await autenticarComo(cenario, "OWNER");
    const imovel = await imovelDisponivel(cenario, "Fora de alcance");

    // Suspenso no banco; a sessão continua dizendo OWNER.
    await prisma.organizationMember.updateMany({
      where: { id: cenario.membro.id, organizationId: cenario.organization.id },
      data: { status: "SUSPENDED" },
    });

    const resultado = await editar(
      imovel.id,
      formularioImovel(imovel, { posicaoDestaqueHome: "1" })
    );
    expect(resultado.success).toBe(false);
    expect(resultado.destino).toBe("/app/login");
    expect(await idsDaHome(cenario.organization.id)).toHaveLength(0);
  });
});
