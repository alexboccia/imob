import { describe, test, expect, afterEach, vi } from "vitest";

// Mesmo padrão de mock já usado em
// tests/integration/manutencao-limpar-midias.test.ts — nunca chama o R2
// real, nem o de teste nem o de produção.
vi.mock("@aws-sdk/client-s3", () => {
  const deleteCalls: string[][] = [];
  let falharProximoLote = false;

  class DeleteObjectsCommand {
    input: { Bucket: string; Delete: { Objects: { Key: string }[] } };
    constructor(input: { Bucket: string; Delete: { Objects: { Key: string }[] } }) {
      this.input = input;
    }
  }
  class S3Client {
    async send(cmd: unknown) {
      if (cmd instanceof DeleteObjectsCommand) {
        if (falharProximoLote) {
          falharProximoLote = false;
          throw new Error("Falha simulada do R2");
        }
        deleteCalls.push(cmd.input.Delete.Objects.map((o) => o.Key));
        return {};
      }
      throw new Error("Comando S3 não mockado: " + (cmd as { constructor: { name: string } }).constructor.name);
    }
  }

  return {
    S3Client,
    DeleteObjectsCommand,
    __getDeleteCalls: () => deleteCalls,
    __resetCalls: () => {
      deleteCalls.length = 0;
    },
    __falharProximoLote: () => {
      falharProximoLote = true;
    },
  };
});

import { chaveDeUrlR2, removerObjetosR2 } from "@/lib/r2-media";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s3mock = (await import("@aws-sdk/client-s3")) as any;

const publicUrl = "https://midia-teste-mock.example/pub";

describe("chaveDeUrlR2", () => {
  test("extrai a chave quando a URL pertence ao bucket público", () => {
    expect(chaveDeUrlR2(`${publicUrl}/org-a/imoveis/foto.webp`, publicUrl)).toBe(
      "org-a/imoveis/foto.webp"
    );
  });

  test("retorna null para URL de outro host", () => {
    expect(chaveDeUrlR2("https://outro-host.example/org-a/imoveis/foto.webp", publicUrl)).toBeNull();
  });
});

describe("removerObjetosR2", () => {
  afterEach(() => {
    s3mock.__resetCalls();
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_PUBLIC_URL;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
  });

  function configurarEnv() {
    process.env.R2_BUCKET_NAME = "bucket-teste-mock";
    process.env.R2_PUBLIC_URL = publicUrl;
    process.env.R2_ACCOUNT_ID = "conta-teste-mock";
    process.env.R2_ACCESS_KEY_ID = "access-key-teste-mock";
    process.env.R2_SECRET_ACCESS_KEY = "secret-key-teste-mock";
  }

  test("remove objetos legítimos da própria organização", async () => {
    configurarEnv();
    const urls = [
      `${publicUrl}/org-a/imoveis/1.webp`,
      `${publicUrl}/org-a/imoveis/2.webp`,
    ];
    const resultado = await removerObjetosR2(urls, "org-a");
    expect(resultado).toEqual({ tentativas: 2, rejeitadas: 0, lotesComFalha: 0 });
    expect(s3mock.__getDeleteCalls()).toEqual([
      ["org-a/imoveis/1.webp", "org-a/imoveis/2.webp"],
    ]);
  });

  // Fase 120-C — nunca confia só na filtragem de quem chamou: mesmo que
  // uma URL de outra organização chegasse até aqui (por engano de um
  // caller futuro), ela é rejeitada e NUNCA enviada ao SDK de exclusão.
  test("isolamento multi-tenant: rejeita (e nunca envia ao R2) chave de outra organização", async () => {
    configurarEnv();
    const urls = [
      `${publicUrl}/org-a/imoveis/minha.webp`,
      `${publicUrl}/org-b/imoveis/de-outra-org.webp`,
    ];
    const resultado = await removerObjetosR2(urls, "org-a");
    expect(resultado).toEqual({ tentativas: 1, rejeitadas: 1, lotesComFalha: 0 });
    expect(s3mock.__getDeleteCalls()).toEqual([["org-a/imoveis/minha.webp"]]);
  });

  test("rejeita URL de host externo (nunca convertida em chave de exclusão)", async () => {
    configurarEnv();
    const resultado = await removerObjetosR2(
      ["https://atacante.example/org-a/imoveis/1.webp"],
      "org-a"
    );
    expect(resultado).toEqual({ tentativas: 0, rejeitadas: 1, lotesComFalha: 0 });
    expect(s3mock.__getDeleteCalls()).toEqual([]);
  });

  test("idempotente: chamar duas vezes com a mesma lista não lança erro (DeleteObjects do S3 é idempotente)", async () => {
    configurarEnv();
    const urls = [`${publicUrl}/org-a/imoveis/1.webp`];
    await removerObjetosR2(urls, "org-a");
    const segunda = await removerObjetosR2(urls, "org-a");
    expect(segunda.lotesComFalha).toBe(0);
    expect(s3mock.__getDeleteCalls()).toHaveLength(2);
  });

  test("divide em lotes de até 1000 chaves", async () => {
    configurarEnv();
    const urls = Array.from({ length: 1500 }, (_, i) => `${publicUrl}/org-a/imoveis/${i}.webp`);
    const resultado = await removerObjetosR2(urls, "org-a");
    expect(resultado.tentativas).toBe(1500);
    const chamadas = s3mock.__getDeleteCalls();
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0]).toHaveLength(1000);
    expect(chamadas[1]).toHaveLength(500);
  });

  test("falha de um lote é contabilizada, nunca lançada (resíduo tolerável, ver limparMidiasOrfas)", async () => {
    configurarEnv();
    s3mock.__falharProximoLote();
    const resultado = await removerObjetosR2([`${publicUrl}/org-a/imoveis/1.webp`], "org-a");
    expect(resultado.lotesComFalha).toBe(1);
  });

  test("sem R2_PUBLIC_URL/R2_BUCKET_NAME configurado, não tenta nada (fail-closed, nunca lança)", async () => {
    const resultado = await removerObjetosR2([`${publicUrl}/org-a/imoveis/1.webp`], "org-a");
    expect(resultado).toEqual({ tentativas: 0, rejeitadas: 1, lotesComFalha: 0 });
    expect(s3mock.__getDeleteCalls()).toEqual([]);
  });

  test("lista vazia é um no-op seguro", async () => {
    configurarEnv();
    const resultado = await removerObjetosR2([], "org-a");
    expect(resultado).toEqual({ tentativas: 0, rejeitadas: 0, lotesComFalha: 0 });
  });
});
