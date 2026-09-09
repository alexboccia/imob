import { describe, test, expect, afterEach, beforeAll, vi } from "vitest";

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
import { criarCenario, criarImovel, criarPessoa } from "@/test/fixtures";
import { solicitarMateriais } from "@/app/[orgSlug]/actions";
import { atualizarImovel } from "@/app/app/imoveis/actions";
import { ORIGENS_CAPTACAO } from "@/lib/captacao";

// =======================================================================
// Materiais de apresentação do imóvel
// =======================================================================
// Book, plantas, tabela de preços: arquivo real do imóvel, entregue
// depois de uma captação de lead, pelo MESMO pipeline do formulário de
// contato (dedupe de Person, Interaction, captação pendente em conflito).

const BASE_R2 = "https://cdn-teste.exemplo/uploads";

beforeAll(() => {
  // A validação da URL do material compara contra a base pública do
  // bucket — nos testes ela é fixa e conhecida.
  process.env.R2_PUBLIC_URL = BASE_R2;
});

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];

afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties", "crm", "email"] });
  cenarios.push(cenario);
  return cenario;
}

let sequencia = 0;
function urlDeMaterial(organizationId: string): string {
  sequencia += 1;
  const n = String(sequencia).padStart(12, "0");
  return `${BASE_R2}/${organizationId}/materiais/11111111-2222-4333-8444-${n}.pdf`;
}

async function criarMaterial(opcoes: {
  organizationId: string;
  propertyId: string;
  name: string;
  sortOrder?: number;
  active?: boolean;
}) {
  return prisma.propertyPresentationMaterial.create({
    data: {
      organizationId: opcoes.organizationId,
      propertyId: opcoes.propertyId,
      name: opcoes.name,
      url: urlDeMaterial(opcoes.organizationId),
      mimeType: "application/pdf",
      sortOrder: opcoes.sortOrder ?? 0,
      active: opcoes.active ?? true,
    },
  });
}

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  // Passa da checagem anti-bot de tempo mínimo.
  fd.set("renderizadoEm", String(Date.now() - 5000));
  return fd;
}

async function pedir(cenario: Cenario, campos: Record<string, string>) {
  return solicitarMateriais(cenario.organization.slug, undefined, formData(campos));
}

// -----------------------------------------------------------------------
// O que a ficha pública tem para mostrar
// -----------------------------------------------------------------------

async function materiaisPublicos(organizationId: string, propertyId: string) {
  return prisma.propertyPresentationMaterial.findMany({
    where: { organizationId, propertyId, active: true },
    orderBy: { sortOrder: "asc" },
    select: { name: true },
  });
}

describe("elegibilidade do bloco", () => {
  test("1) imóvel comum sem material: nada a exibir", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id });
    expect(await materiaisPublicos(c.organization.id, imovel.id)).toEqual([]);
  });

  test("2) LANÇAMENTO sem material: continua sem nada — não se inventa book", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await prisma.property.updateMany({
      where: { id: imovel.id, organizationId: c.organization.id },
      data: { isLaunch: true },
    });
    expect(await materiaisPublicos(c.organization.id, imovel.id)).toEqual([]);

    // E pedir material num imóvel sem material não cria lead nenhum.
    const resultado = await pedir(c, {
      nome: "Visitante",
      email: "sem-material@email.com",
      telefone: "",
      imovelId: imovel.id,
    });
    expect(resultado.sucesso).toBe(false);
    expect(
      await prisma.interaction.count({ where: { organizationId: c.organization.id } })
    ).toBe(0);
    expect(
      await prisma.person.count({ where: { organizationId: c.organization.id } })
    ).toBe(0);
  });

  test("3/4) imóvel comum e lançamento COM material exibem a mesma lista", async () => {
    const c = await novoCenario();
    const comum = await criarImovel({ organizationId: c.organization.id, title: "Comum" });
    const lancamento = await criarImovel({ organizationId: c.organization.id, title: "Lançamento" });
    await prisma.property.updateMany({
      where: { id: lancamento.id, organizationId: c.organization.id },
      data: { isLaunch: true },
    });
    await criarMaterial({ organizationId: c.organization.id, propertyId: comum.id, name: "Planta" });
    await criarMaterial({
      organizationId: c.organization.id,
      propertyId: lancamento.id,
      name: "Book",
    });

    expect(await materiaisPublicos(c.organization.id, comum.id)).toEqual([{ name: "Planta" }]);
    expect(await materiaisPublicos(c.organization.id, lancamento.id)).toEqual([{ name: "Book" }]);
  });

  test("5/7) múltiplos materiais saem na ordem explícita, não na de criação", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await criarMaterial({ organizationId: c.organization.id, propertyId: imovel.id, name: "Tabela", sortOrder: 2 });
    await criarMaterial({ organizationId: c.organization.id, propertyId: imovel.id, name: "Book", sortOrder: 0 });
    await criarMaterial({ organizationId: c.organization.id, propertyId: imovel.id, name: "Plantas", sortOrder: 1 });

    expect(await materiaisPublicos(c.organization.id, imovel.id)).toEqual([
      { name: "Book" },
      { name: "Plantas" },
      { name: "Tabela" },
    ]);
  });

  test("6) material inativo não é exibido nem entregue", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await criarMaterial({ organizationId: c.organization.id, propertyId: imovel.id, name: "Ativo", sortOrder: 0 });
    await criarMaterial({
      organizationId: c.organization.id,
      propertyId: imovel.id,
      name: "Desativado",
      sortOrder: 1,
      active: false,
    });

    expect(await materiaisPublicos(c.organization.id, imovel.id)).toEqual([{ name: "Ativo" }]);

    const resultado = await pedir(c, {
      nome: "Visitante",
      email: "inativo@email.com",
      telefone: "",
      imovelId: imovel.id,
    });
    expect(resultado.materiais?.map((m) => m.name)).toEqual(["Ativo"]);
  });
});

describe("captação de lead", () => {
  test("13/15) pedido válido cria Person e Interaction com origem MATERIAIS e sem notes", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await criarMaterial({ organizationId: c.organization.id, propertyId: imovel.id, name: "Book" });

    const resultado = await pedir(c, {
      nome: "Visitante",
      email: "lead@email.com",
      telefone: "",
      imovelId: imovel.id,
    });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.materiais?.map((m) => m.name)).toEqual(["Book"]);
    // A URL só existe DEPOIS da captação — é ela que o visitante baixa.
    expect(resultado.materiais?.[0].url).toContain(`${c.organization.id}/materiais/`);

    const pessoa = await prisma.person.findFirstOrThrow({
      where: { organizationId: c.organization.id, emailNormalized: "lead@email.com" },
    });
    const interacoes = await prisma.interaction.findMany({
      where: { organizationId: c.organization.id, personId: pessoa.id },
    });
    expect(interacoes).toHaveLength(1);
    expect(interacoes[0].origin).toBe(ORIGENS_CAPTACAO.MATERIAIS);
    expect(interacoes[0].propertyId).toBe(imovel.id);
    // notes é histórico comercial escrito por gente: o pedido está em
    // `origin`, não numa frase fabricada por nós.
    expect(interacoes[0].notes).toBeNull();
  });

  test("14) o mesmo visitante pedindo duas vezes NÃO duplica Person, e cada pedido é um evento", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await criarMaterial({ organizationId: c.organization.id, propertyId: imovel.id, name: "Book" });

    for (let i = 0; i < 2; i++) {
      const r = await pedir(c, {
        nome: "Visitante",
        email: "repetido@email.com",
        telefone: "",
        imovelId: imovel.id,
      });
      expect(r.sucesso).toBe(true);
    }

    const pessoas = await prisma.person.findMany({
      where: { organizationId: c.organization.id, emailNormalized: "repetido@email.com" },
    });
    expect(pessoas).toHaveLength(1);
    expect(
      await prisma.interaction.count({
        where: { organizationId: c.organization.id, personId: pessoas[0].id },
      })
    ).toBe(2);
  });

  test("conflito de identidade: vira captação pendente e o visitante recebe os materiais assim mesmo", async () => {
    const c = await novoCenario();
    const orgId = c.organization.id;
    const imovel = await criarImovel({ organizationId: orgId });
    await criarMaterial({ organizationId: orgId, propertyId: imovel.id, name: "Book" });

    await criarPessoa({ organizationId: orgId, email: "conflito-mat@email.com" });
    await criarPessoa({ organizationId: orgId, phone: "(11) 98888-7777" });

    const resultado = await pedir(c, {
      nome: "Ambíguo",
      email: "conflito-mat@email.com",
      telefone: "(11) 98888-7777",
      imovelId: imovel.id,
    });

    // A ambiguidade é de IDENTIDADE, não de direito ao material.
    expect(resultado.sucesso).toBe(true);
    expect(resultado.materiais?.map((m) => m.name)).toEqual(["Book"]);

    const captacoes = await prisma.leadCapture.findMany({ where: { organizationId: orgId } });
    expect(captacoes).toHaveLength(1);
    expect(captacoes[0].origin).toBe(ORIGENS_CAPTACAO.MATERIAIS);
    expect(captacoes[0].propertyId).toBe(imovel.id);
    expect(captacoes[0].message).toBeNull();
    expect(await prisma.interaction.count({ where: { organizationId: orgId } })).toBe(0);
  });

  test("sem e-mail e sem telefone o pedido é recusado — lead sem retorno não é lead", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await criarMaterial({ organizationId: c.organization.id, propertyId: imovel.id, name: "Book" });

    const resultado = await pedir(c, {
      nome: "Anônimo",
      email: "",
      telefone: "",
      imovelId: imovel.id,
    });
    expect(resultado.sucesso).toBe(false);
    expect(resultado.materiais).toBeUndefined();
    expect(await prisma.person.count({ where: { organizationId: c.organization.id } })).toBe(0);
  });

  test("16) sem o módulo de e-mail, o lead e a entrega acontecem do mesmo jeito", async () => {
    // Prova a regra central: a entrega NÃO depende de e-mail. Com o
    // módulo desabilitado nenhuma notificação é enviada, e nem por isso
    // o visitante deixa de receber os arquivos.
    const c = await criarCenario({ modulos: ["core", "properties", "crm"] });
    cenarios.push(c);
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await criarMaterial({ organizationId: c.organization.id, propertyId: imovel.id, name: "Book" });

    const resultado = await pedir(c, {
      nome: "Visitante",
      email: "sem-modulo@email.com",
      telefone: "",
      imovelId: imovel.id,
    });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.materiais).toHaveLength(1);
    expect(await prisma.interaction.count({ where: { organizationId: c.organization.id } })).toBe(1);
  });

  test("honeypot: resposta de sucesso, nenhum arquivo e nenhum lead", async () => {
    const c = await novoCenario();
    const imovel = await criarImovel({ organizationId: c.organization.id });
    await criarMaterial({ organizationId: c.organization.id, propertyId: imovel.id, name: "Book" });

    const resultado = await pedir(c, {
      nome: "Bot",
      email: "bot@email.com",
      telefone: "",
      imovelId: imovel.id,
      website: "http://spam.test",
    });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.materiais).toEqual([]);
    expect(await prisma.person.count({ where: { organizationId: c.organization.id } })).toBe(0);
  });
});

describe("isolamento entre organizações", () => {
  test("8/9) IDOR: imóvel da organização B não entrega material pelo site da A", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const imovelB = await criarImovel({ organizationId: b.organization.id });
    await criarMaterial({
      organizationId: b.organization.id,
      propertyId: imovelB.id,
      name: "Book confidencial de B",
    });

    const resultado = await solicitarMateriais(
      a.organization.slug,
      undefined,
      formData({
        nome: "Curioso",
        email: "curioso@email.com",
        telefone: "",
        imovelId: imovelB.id,
      })
    );

    expect(resultado.sucesso).toBe(false);
    expect(resultado.materiais).toBeUndefined();
    // Nenhum registro em nenhuma das duas organizações.
    expect(await prisma.interaction.count({ where: { organizationId: a.organization.id } })).toBe(0);
    expect(await prisma.interaction.count({ where: { organizationId: b.organization.id } })).toBe(0);
    expect(await prisma.leadCapture.count({ where: { organizationId: b.organization.id } })).toBe(0);
  });
});

// -----------------------------------------------------------------------
// Administração: o que o formulário do imóvel grava
// -----------------------------------------------------------------------

async function autenticarComo(cenario: Cenario) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
      emitidaEm: Math.floor(Date.now() / 1000),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// atualizarImovel redireciona para a ficha quando salva — o mock de
// next/navigation transforma isso em exceção, então salvar com sucesso é
// exatamente o caminho que "estoura" aqui.
async function salvarImovel(imovelId: string, formData: FormData) {
  try {
    await atualizarImovel(imovelId, { success: false }, formData);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (!mensagem.startsWith("redirect:")) throw erro;
  }
}

function formDataImovel(titulo: string, materiaisJson: string) {
  const fd = new FormData();
  fd.set("titulo", titulo);
  fd.set("tipo", "Apartamento");
  fd.set("finalidade", "SALE");
  fd.set("status", "AVAILABLE");
  fd.set("bairro", "Centro");
  fd.set("cidade", "São Paulo");
  fd.set("estado", "SP");
  fd.set("midiasJson", "[]");
  fd.set("materiaisJson", materiaisJson);
  return fd;
}

describe("cadastro dos materiais pelo painel", () => {
  test("10/12) salva a lista com ordem e estado; salvar sem um material o remove", async () => {
    const c = await novoCenario();
    await autenticarComo(c);
    const imovel = await criarImovel({ organizationId: c.organization.id, title: "Com materiais" });

    const urlA = urlDeMaterial(c.organization.id);
    const urlB = urlDeMaterial(c.organization.id);
    await salvarImovel(
      imovel.id,
      formDataImovel(
        "Com materiais",
        JSON.stringify([
          { name: "Book", url: urlA, active: true },
          { name: "Tabela", url: urlB, active: false },
        ])
      )
    );

    const gravados = await prisma.propertyPresentationMaterial.findMany({
      where: { organizationId: c.organization.id, propertyId: imovel.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(gravados.map((m) => [m.name, m.sortOrder, m.active, m.mimeType])).toEqual([
      ["Book", 0, true, "application/pdf"],
      ["Tabela", 1, false, "application/pdf"],
    ]);

    // Nova submissão sem o segundo: a lista enviada é sempre a completa.
    await salvarImovel(
      imovel.id,
      formDataImovel("Com materiais", JSON.stringify([{ name: "Book", url: urlA, active: true }]))
    );

    const depois = await prisma.propertyPresentationMaterial.findMany({
      where: { organizationId: c.organization.id, propertyId: imovel.id },
    });
    expect(depois.map((m) => m.name)).toEqual(["Book"]);
  });

  test("11) URL de outro tenant ou de domínio externo é descartada no servidor", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    await autenticarComo(a);
    const imovel = await criarImovel({ organizationId: a.organization.id, title: "Alvo" });

    const legitima = urlDeMaterial(a.organization.id);
    await salvarImovel(
      imovel.id,
      formDataImovel(
        "Alvo",
        JSON.stringify([
          { name: "Do tenant B", url: urlDeMaterial(b.organization.id), active: true },
          { name: "Externo", url: "https://evil.test/book.pdf", active: true },
          { name: "Legítimo", url: legitima, active: true },
        ])
      )
    );

    const gravados = await prisma.propertyPresentationMaterial.findMany({
      where: { organizationId: a.organization.id, propertyId: imovel.id },
    });
    expect(gravados.map((m) => m.name)).toEqual(["Legítimo"]);
    expect(gravados[0].url).toBe(legitima);
  });
});
