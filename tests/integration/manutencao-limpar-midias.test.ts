import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarImovel } from "@/test/fixtures";

// Mesma limitação de resolução de módulo já documentada nos outros testes
// de integração desta sessão (next-auth → next/server não resolve sob
// Vitest puro).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

// Mock do SDK do S3/R2 — nunca chama o Cloudflare R2 real (nem o bucket
// de teste, nem produção). `__setObjetosFake`/`__getDeleteCalls` dão
// controle total sobre o que "existe no storage" e o que foi
// efetivamente pedido pra apagar, incluindo LastModified arbitrário (o
// que o R2 real não permite controlar num PutObject de teste — por isso
// mockar é a única forma segura e determinística de testar a regra das
// 24h).
vi.mock("@aws-sdk/client-s3", () => {
  let objetosFake: { Key: string; LastModified?: Date }[] = [];
  const deleteCalls: string[][] = [];
  const listCalls: string[] = [];

  class ListObjectsV2Command {
    input: { Bucket: string; Prefix: string; ContinuationToken?: string };
    constructor(input: { Bucket: string; Prefix: string; ContinuationToken?: string }) {
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
      if (cmd instanceof ListObjectsV2Command) {
        listCalls.push(cmd.input.Prefix);
        const contents = objetosFake.filter((o) => o.Key.startsWith(cmd.input.Prefix));
        return { Contents: contents, IsTruncated: false };
      }
      if (cmd instanceof DeleteObjectsCommand) {
        const chaves = cmd.input.Delete.Objects.map((o) => o.Key);
        deleteCalls.push(chaves);
        objetosFake = objetosFake.filter((o) => !chaves.includes(o.Key));
        return {};
      }
      throw new Error("Comando S3 não mockado: " + (cmd as { constructor: { name: string } }).constructor.name);
    }
  }

  return {
    S3Client,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    __setObjetosFake: (objetos: typeof objetosFake) => {
      objetosFake = objetos;
    },
    __getDeleteCalls: () => deleteCalls,
    __getListCalls: () => listCalls,
    __resetCalls: () => {
      deleteCalls.length = 0;
      listCalls.length = 0;
    },
  };
});

import { auth } from "@/lib/auth";
import { limparMidiasOrfas } from "@/app/app/manutencao/actions";

type Cenario = Awaited<ReturnType<typeof criarCenario>>;

function autenticarComo(cenario: Cenario, role: string = "OWNER") {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s3mock = (await import("@aws-sdk/client-s3")) as any;

// .env.test não define credenciais/bucket reais de R2 (de propósito —
// nunca deve existir infraestrutura real de R2 acessível a partir de
// teste automatizado). A action em si já valida presença dessas duas
// variáveis antes de tocar o client; como o próprio client S3 está
// mockado acima (nenhuma chamada de rede real acontece), só precisamos
// satisfazer essa validação com valores de fantasia.
process.env.R2_BUCKET_NAME = "bucket-teste-mock";
const publicUrl = "https://midia-teste-mock.example/pub";
process.env.R2_PUBLIC_URL = publicUrl;
process.env.R2_ACCOUNT_ID = "conta-teste-mock";
process.env.R2_ACCESS_KEY_ID = "access-key-teste-mock";
process.env.R2_SECRET_ACCESS_KEY = "secret-key-teste-mock";

const HORA_MS = 60 * 60 * 1000;
const agora = Date.now();
const antigoDe25h = new Date(agora - 25 * HORA_MS);
const recenteDe1h = new Date(agora - 1 * HORA_MS);

describe("limparMidiasOrfas", () => {
  let cenario: Cenario | undefined;
  let cenarioB: Cenario | undefined;

  afterEach(async () => {
    if (cenario) await cenario.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenario = undefined;
    cenarioB = undefined;
    s3mock.__setObjetosFake([]);
    s3mock.__resetCalls();
    vi.mocked(auth).mockReset();
  });

  test("remove apenas arquivo sem vínculo e com mais de 24 horas; protege arquivo recente sem vínculo", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    const prefixo = `${cenario.organization.id}/imoveis/`;
    s3mock.__setObjetosFake([
      { Key: `${prefixo}orfa-antiga.jpg`, LastModified: antigoDe25h },
      { Key: `${prefixo}orfa-recente.jpg`, LastModified: recenteDe1h },
    ]);

    const resultado = await limparMidiasOrfas();

    expect(resultado.totalObjetos).toBe(2);
    expect(resultado.totalRemovidas).toBe(1);
    const chavesRemovidas = s3mock.__getDeleteCalls().flat();
    expect(chavesRemovidas).toEqual([`${prefixo}orfa-antiga.jpg`]);
  });

  test("não remove arquivo com mais de 24 horas que está vinculado a uma Media existente", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario);

    const prefixo = `${cenario.organization.id}/imoveis/`;
    const chaveEmUso = `${prefixo}usada.jpg`;
    const imovel = await criarImovel({ organizationId: cenario.organization.id });
    await prisma.media.create({
      data: {
        organizationId: cenario.organization.id,
        propertyId: imovel.id,
        url: `${publicUrl}/${chaveEmUso}`,
        type: "PHOTO",
      },
    });

    s3mock.__setObjetosFake([{ Key: chaveEmUso, LastModified: antigoDe25h }]);

    const resultado = await limparMidiasOrfas();

    expect(resultado.totalRemovidas).toBe(0);
    expect(s3mock.__getDeleteCalls()).toEqual([]);
  });

  test("tenant isolation: listagem usa somente o prefixo da própria organização", async () => {
    cenario = await criarCenario();
    cenarioB = await criarCenario();
    autenticarComo(cenario);

    s3mock.__setObjetosFake([
      { Key: `${cenario.organization.id}/imoveis/minha.jpg`, LastModified: antigoDe25h },
      { Key: `${cenarioB.organization.id}/imoveis/de-outra-org.jpg`, LastModified: antigoDe25h },
    ]);

    const resultado = await limparMidiasOrfas();

    expect(resultado.totalObjetos).toBe(1);
    expect(s3mock.__getListCalls()).toEqual([`${cenario.organization.id}/imoveis/`]);
    const chavesRemovidas = s3mock.__getDeleteCalls().flat();
    expect(chavesRemovidas).toEqual([`${cenario.organization.id}/imoveis/minha.jpg`]);
  });

  test("papel sem permissão não executa a limpeza", async () => {
    cenario = await criarCenario();
    autenticarComo(cenario, "AGENT");

    s3mock.__setObjetosFake([
      { Key: `${cenario.organization.id}/imoveis/orfa-antiga.jpg`, LastModified: antigoDe25h },
    ]);

    await expect(limparMidiasOrfas()).rejects.toThrow(
      "Apenas administradores ou gestores podem executar essa limpeza."
    );
    expect(s3mock.__getListCalls()).toEqual([]);
    expect(s3mock.__getDeleteCalls()).toEqual([]);
  });
});
