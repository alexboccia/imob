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
import { criarCenario, criarImovel as criarImovelDireto } from "@/test/fixtures";
import { criarImovel, atualizarImovel } from "@/app/app/imoveis/actions";
import type { ActionState } from "@/lib/action-result";

// =======================================================================
// Conteúdo editorial da galeria (Fase 45) — pelas actions reais
// =======================================================================
// O que se protege aqui é a IDENTIDADE do conteúdo: a legenda acompanha a
// foto (nunca a posição), o título/subtítulo acompanham o imóvel (nunca a
// capa), e nada disso atravessa imóvel ou organização.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];

afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario({ modulos: ["core", "properties"] });
  cenarios.push(cenario);
  return cenario;
}

function autenticarComo(cenario: Cenario) {
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

type Foto = { url: string; capa?: boolean; legenda?: unknown; [extra: string]: unknown };

function formImovel(opcoes: { fotos: Foto[]; titulo?: string; subtitulo?: string }) {
  const fd = new FormData();
  fd.set("titulo", "Imóvel editorial");
  fd.set("tipo", "Apartamento");
  fd.set("finalidade", "SALE");
  fd.set("status", "AVAILABLE");
  fd.set("bairro", "Santana");
  fd.set("cidade", "São Paulo");
  fd.set("estado", "SP");
  if (opcoes.titulo !== undefined) fd.set("tituloDestaque", opcoes.titulo);
  if (opcoes.subtitulo !== undefined) fd.set("subtituloDestaque", opcoes.subtitulo);
  fd.set(
    "midiasJson",
    JSON.stringify(
      opcoes.fotos.map(({ url, capa, legenda, ...extra }) => ({
        tipo: "FOTO",
        url,
        ehCapa: Boolean(capa),
        ...(legenda !== undefined ? { legenda } : {}),
        ...extra,
      }))
    )
  );
  return fd;
}

async function executar(acao: () => Promise<ActionState>): Promise<ActionState | "salvou"> {
  try {
    return await acao();
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (!mensagem.startsWith("redirect:")) throw erro;
    return "salvou";
  }
}

const salvar = (imovelId: string, opcoes: Parameters<typeof formImovel>[0]) =>
  executar(() => atualizarImovel(imovelId, { success: false }, formImovel(opcoes)));

async function fotosGravadas(organizationId: string, propertyId: string) {
  return prisma.media.findMany({
    where: { organizationId, propertyId, type: "PHOTO" },
    orderBy: { order: "asc" },
    select: { url: true, caption: true, isCover: true, order: true },
  });
}

async function hero(organizationId: string, id: string) {
  return prisma.property.findFirstOrThrow({
    where: { id, organizationId },
    select: { heroTitle: true, heroSubtitle: true },
  });
}

const A = "https://cdn.exemplo/a-fachada.jpg";
const B = "https://cdn.exemplo/b-academia.jpg";
const C = "https://cdn.exemplo/c-sem-legenda.jpg";
const TITULO = "Um novo jeito de viver em Santana";
const SUBTITULO = "Conforto, modernidade e localização privilegiada.";

describe("criação", () => {
  test("o imóvel nasce com título, subtítulo e legendas", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const r = await executar(() =>
      criarImovel(
        { success: false },
        formImovel({
          titulo: TITULO,
          subtitulo: SUBTITULO,
          fotos: [
            { url: A, capa: true, legenda: "Fachada" },
            { url: B, legenda: "Academia" },
          ],
        })
      )
    );
    expect(r).toBe("salvou");
    const imovel = await prisma.property.findFirstOrThrow({
      where: { organizationId: c.organization.id },
      select: { id: true, heroTitle: true, heroSubtitle: true },
    });
    expect(imovel.heroTitle).toBe(TITULO);
    expect(imovel.heroSubtitle).toBe(SUBTITULO);
    expect((await fotosGravadas(c.organization.id, imovel.id)).map((f) => [f.url, f.caption])).toEqual([
      [A, "Fachada"],
      [B, "Academia"],
    ]);
  });
});

describe("edição — identidade do conteúdo", () => {
  test("reordenar B, C, A mantém cada legenda na sua foto (salvar e reabrir)", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const imovel = await criarImovelDireto({ organizationId: c.organization.id });

    expect(
      await salvar(imovel.id, {
        fotos: [
          { url: A, capa: true, legenda: "Fachada" },
          { url: B, legenda: "Academia" },
          { url: C, legenda: null },
        ],
      })
    ).toBe("salvou");

    // O formulário reabre com as legendas nos itens e o corretor arrasta.
    expect(
      await salvar(imovel.id, {
        fotos: [
          { url: B, legenda: "Academia" },
          { url: C },
          { url: A, capa: true, legenda: "Fachada" },
        ],
      })
    ).toBe("salvou");

    expect(await fotosGravadas(c.organization.id, imovel.id)).toEqual([
      { url: B, caption: "Academia", isCover: false, order: 0 },
      { url: C, caption: null, isCover: false, order: 1 },
      { url: A, caption: "Fachada", isCover: true, order: 2 },
    ]);
  });

  test("trocar a capa não move legenda nem título/subtítulo", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const imovel = await criarImovelDireto({ organizationId: c.organization.id });
    const antes = {
      titulo: TITULO,
      subtitulo: SUBTITULO,
      fotos: [
        { url: A, capa: true, legenda: "Fachada" },
        { url: B, legenda: "Academia" },
      ],
    };
    expect(await salvar(imovel.id, antes)).toBe("salvou");

    expect(
      await salvar(imovel.id, {
        ...antes,
        fotos: [
          { url: A, legenda: "Fachada" },
          { url: B, capa: true, legenda: "Academia" },
        ],
      })
    ).toBe("salvou");

    expect(await hero(c.organization.id, imovel.id)).toEqual({
      heroTitle: TITULO,
      heroSubtitle: SUBTITULO,
    });
    expect((await fotosGravadas(c.organization.id, imovel.id)).map((f) => [f.url, f.caption, f.isCover])).toEqual([
      [A, "Fachada", false],
      [B, "Academia", true],
    ]);
  });

  test("limpar: vazio e só espaços viram null (título, subtítulo e legenda)", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const imovel = await criarImovelDireto({ organizationId: c.organization.id });
    await salvar(imovel.id, {
      titulo: TITULO,
      subtitulo: SUBTITULO,
      fotos: [{ url: A, capa: true, legenda: "Fachada" }],
    });

    expect(
      await salvar(imovel.id, {
        titulo: "",
        subtitulo: "   \n ",
        fotos: [{ url: A, capa: true, legenda: "   " }],
      })
    ).toBe("salvou");
    expect(await hero(c.organization.id, imovel.id)).toEqual({ heroTitle: null, heroSubtitle: null });
    expect((await fotosGravadas(c.organization.id, imovel.id))[0].caption).toBeNull();
  });

  test("acentos, caracteres especiais e texto parecido com HTML são gravados como texto", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const imovel = await criarImovelDireto({ organizationId: c.organization.id });
    expect(
      await salvar(imovel.id, {
        titulo: "Vista & lazer — <b>Santana</b>",
        fotos: [
          { url: A, capa: true, legenda: "Suíte máster · 2º andar" },
          { url: B, legenda: "<script>alert(1)</script>" },
        ],
      })
    ).toBe("salvou");
    expect((await hero(c.organization.id, imovel.id)).heroTitle).toBe("Vista & lazer — <b>Santana</b>");
    expect((await fotosGravadas(c.organization.id, imovel.id)).map((f) => f.caption)).toEqual([
      "Suíte máster · 2º andar",
      "<script>alert(1)</script>",
    ]);
  });

  test.each([
    ["legenda", { fotos: [{ url: A, capa: true, legenda: "x".repeat(81) }] }, "midiasJson"],
    ["título", { titulo: "x".repeat(81), fotos: [{ url: A, capa: true }] }, "tituloDestaque"],
    ["subtítulo", { subtitulo: "x".repeat(161), fotos: [{ url: A, capa: true }] }, "subtituloDestaque"],
  ])("%s acima do limite recusa o salvamento e não altera nada", async (_nome, opcoes, campo) => {
    const c = await novoCenario();
    autenticarComo(c);
    const imovel = await criarImovelDireto({ organizationId: c.organization.id });
    await salvar(imovel.id, { titulo: TITULO, fotos: [{ url: A, capa: true, legenda: "Fachada" }] });

    const r = await salvar(imovel.id, opcoes as Parameters<typeof formImovel>[0]);
    expect(r).not.toBe("salvou");
    expect((r as ActionState).fieldErrors?.[campo]).toHaveLength(1);
    expect((await hero(c.organization.id, imovel.id)).heroTitle).toBe(TITULO);
    expect((await fotosGravadas(c.organization.id, imovel.id)).map((f) => f.caption)).toEqual(["Fachada"]);
  });
});

describe("tenant e mass assignment", () => {
  test("id/organizationId/propertyId injetados no item não alcançam mídia de outro imóvel ou organização", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const imovelA = await criarImovelDireto({ organizationId: a.organization.id });
    const imovelB = await criarImovelDireto({ organizationId: b.organization.id });

    autenticarComo(b);
    await salvar(imovelB.id, { fotos: [{ url: B, capa: true, legenda: "Academia" }] });
    const [fotoB] = await prisma.media.findMany({
      where: { organizationId: b.organization.id, propertyId: imovelB.id },
      select: { id: true, caption: true },
    });

    autenticarComo(a);
    expect(
      await salvar(imovelA.id, {
        fotos: [
          {
            url: A,
            capa: true,
            legenda: "Fachada",
            id: fotoB.id,
            organizationId: b.organization.id,
            propertyId: imovelB.id,
            caption: "forjada",
          },
        ],
      })
    ).toBe("salvou");

    // A mídia da organização B não mudou.
    expect(
      await prisma.media.findFirstOrThrow({
        where: { id: fotoB.id, organizationId: b.organization.id },
        select: { caption: true, propertyId: true },
      })
    ).toEqual({ caption: "Academia", propertyId: imovelB.id });
    // A organização A ganhou uma mídia NOVA, dela, com a legenda do campo certo.
    const deA = await fotosGravadas(a.organization.id, imovelA.id);
    expect(deA).toEqual([{ url: A, caption: "Fachada", isCover: true, order: 0 }]);
    expect(await prisma.media.count({ where: { id: fotoB.id, organizationId: a.organization.id } })).toBe(0);
  });

  test("imóvel de outra organização: título, subtítulo e legendas intactos", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    const imovelB = await criarImovelDireto({ organizationId: b.organization.id });
    autenticarComo(b);
    await salvar(imovelB.id, {
      titulo: TITULO,
      subtitulo: SUBTITULO,
      fotos: [{ url: B, capa: true, legenda: "Academia" }],
    });

    autenticarComo(a);
    await salvar(imovelB.id, {
      titulo: "Invasão",
      subtitulo: "Invasão",
      fotos: [{ url: A, capa: true, legenda: "Invasão" }],
    }).catch(() => undefined);

    expect(await hero(b.organization.id, imovelB.id)).toEqual({ heroTitle: TITULO, heroSubtitle: SUBTITULO });
    expect((await fotosGravadas(b.organization.id, imovelB.id)).map((f) => [f.url, f.caption])).toEqual([
      [B, "Academia"],
    ]);
    expect(await prisma.media.count({ where: { organizationId: a.organization.id } })).toBe(0);
  });
});
