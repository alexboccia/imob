import { describe, test, expect, afterEach, beforeAll, vi } from "vitest";

// Mesma limitação de resolução de módulo já documentada nos outros
// testes de integração desta sessão (next-auth → next/server não
// resolve sob Vitest puro).
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

// Mock do SDK S3/R2 — nunca chama o Cloudflare real, mesmo padrão já
// usado em tests/integration/manutencao-limpar-midias.test.ts.
vi.mock("@aws-sdk/client-s3", () => {
  const deleteCalls: string[][] = [];

  class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class DeleteObjectsCommand {
    input: { Bucket: string; Delete: { Objects: { Key: string }[] } };
    constructor(input: { Bucket: string; Delete: { Objects: { Key: string }[] } }) {
      this.input = input;
    }
  }
  class S3Client {
    async send(cmd: unknown) {
      if (cmd instanceof DeleteObjectsCommand) {
        deleteCalls.push(cmd.input.Delete.Objects.map((o) => o.Key));
        return {};
      }
      if (cmd instanceof PutObjectCommand) return {};
      throw new Error("Comando S3 não mockado: " + (cmd as { constructor: { name: string } }).constructor.name);
    }
  }

  return {
    S3Client,
    PutObjectCommand,
    DeleteObjectsCommand,
    __getDeleteCalls: () => deleteCalls,
    __resetCalls: () => {
      deleteCalls.length = 0;
    },
  };
});

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { OrganizationRole } from "@/generated/prisma/client";
import { criarCenario, criarImovel } from "@/test/fixtures";
import { atualizarImovel } from "@/app/app/imoveis/actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s3mock = (await import("@aws-sdk/client-s3")) as any;

const BASE_R2 = "https://midia-teste-mock.example/pub";

beforeAll(() => {
  process.env.R2_PUBLIC_URL = BASE_R2;
  process.env.R2_BUCKET_NAME = "bucket-teste-mock";
  process.env.R2_ACCOUNT_ID = "conta-teste-mock";
  process.env.R2_ACCESS_KEY_ID = "access-key-teste-mock";
  process.env.R2_SECRET_ACCESS_KEY = "secret-key-teste-mock";
});

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];

afterEach(async () => {
  vi.mocked(auth).mockReset();
  s3mock.__resetCalls();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(): Promise<Cenario> {
  const cenario = await criarCenario();
  cenarios.push(cenario);
  return cenario;
}

async function autenticarComo(cenario: Cenario, role: string = "OWNER") {
  await prisma.organizationMember.updateMany({
    where: { id: cenario.membro.id, organizationId: cenario.organization.id },
    data: { role: role as OrganizationRole },
  });
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

let sequencia = 0;
function urlDeFoto(organizationId: string): string {
  sequencia += 1;
  const n = String(sequencia).padStart(12, "0");
  return `${BASE_R2}/${organizationId}/imoveis/11111111-2222-4333-8444-${n}.webp`;
}

function formDataImovel(titulo: string, midiasJson: string) {
  const fd = new FormData();
  fd.set("titulo", titulo);
  fd.set("tipo", "Apartamento");
  fd.set("finalidade", "SALE");
  fd.set("status", "AVAILABLE");
  fd.set("bairro", "Centro");
  fd.set("cidade", "São Paulo");
  fd.set("estado", "SP");
  fd.set("midiasJson", midiasJson);
  return fd;
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

describe("Fase 120-C — remoção real do objeto R2 ao substituir/remover foto", () => {
  test("foto removida da lista: linha Media apagada E objeto R2 removido; foto mantida nunca é tocada", async () => {
    const c = await novoCenario();
    await autenticarComo(c);
    const imovel = await criarImovel({ organizationId: c.organization.id, title: "Com fotos" });

    const urlMantida = urlDeFoto(c.organization.id);
    const urlRemovida = urlDeFoto(c.organization.id);
    await prisma.media.createMany({
      data: [
        { organizationId: c.organization.id, propertyId: imovel.id, url: urlMantida, type: "PHOTO" },
        { organizationId: c.organization.id, propertyId: imovel.id, url: urlRemovida, type: "PHOTO" },
      ],
    });

    await salvarImovel(
      imovel.id,
      formDataImovel(
        "Com fotos",
        JSON.stringify([{ tipo: "FOTO", url: urlMantida, ehCapa: true }])
      )
    );

    const mediasRestantes = await prisma.media.findMany({
      where: { propertyId: imovel.id, organizationId: c.organization.id },
    });
    expect(mediasRestantes.map((m) => m.url)).toEqual([urlMantida]);

    const chaveRemovida = urlRemovida.slice(BASE_R2.length + 1);
    const chaveMantida = urlMantida.slice(BASE_R2.length + 1);
    const chavesRemovidasNoR2 = s3mock.__getDeleteCalls().flat();
    expect(chavesRemovidasNoR2).toEqual([chaveRemovida]);
    expect(chavesRemovidasNoR2).not.toContain(chaveMantida);
  });

  test("nenhuma foto removida: nenhuma chamada de exclusão ao R2", async () => {
    const c = await novoCenario();
    await autenticarComo(c);
    const imovel = await criarImovel({ organizationId: c.organization.id, title: "Sem remoção" });

    const url = urlDeFoto(c.organization.id);
    await prisma.media.create({
      data: { organizationId: c.organization.id, propertyId: imovel.id, url, type: "PHOTO" },
    });

    await salvarImovel(
      imovel.id,
      formDataImovel("Sem remoção", JSON.stringify([{ tipo: "FOTO", url, ehCapa: true }]))
    );

    expect(s3mock.__getDeleteCalls()).toEqual([]);
  });

  test("isolamento multi-tenant: remoção de foto na organização A nunca envia chave da organização B ao R2", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    await autenticarComo(a);
    const imovelA = await criarImovel({ organizationId: a.organization.id, title: "Imóvel A" });

    const urlDeB = urlDeFoto(b.organization.id);
    const urlDeA = urlDeFoto(a.organization.id);
    // Linha de Media pertence à organização A (é dela que o fluxo lê o
    // "antes"), mas a URL aponta (cenário adversarial) pro prefixo de B
    // — removerObjetosR2 precisa rejeitar isso mesmo assim, nunca
    // confiando só na organizationId da linha.
    await prisma.media.create({
      data: { organizationId: a.organization.id, propertyId: imovelA.id, url: urlDeB, type: "PHOTO" },
    });

    await salvarImovel(
      imovelA.id,
      formDataImovel("Imóvel A", JSON.stringify([{ tipo: "FOTO", url: urlDeA, ehCapa: true }]))
    );

    const chavesRemovidasNoR2 = s3mock.__getDeleteCalls().flat();
    expect(chavesRemovidasNoR2).toEqual([]);
  });
});
