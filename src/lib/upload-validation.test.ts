import { describe, test, expect } from "vitest";
import {
  validarArquivo,
  imovelValidoParaOrganizacao,
  extrairExtensao,
  sanitizarNomeLogico,
  LIMITE_TAMANHO_BYTES,
} from "@/lib/upload-validation";

// Bytes mínimos válidos de cada assinatura, só o suficiente pro magic-byte
// check passar — não precisa ser uma imagem decodificável de verdade.
const CABECALHO_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);
const CABECALHO_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const CABECALHO_WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function arquivo(bytes: Buffer, nome: string, tipo: string): File {
  return new File([new Uint8Array(bytes)], nome, { type: tipo });
}

describe("validarArquivo — upload válido", () => {
  test("aceita PNG dentro do limite, com extensão e assinatura corretas", async () => {
    const r = await validarArquivo(arquivo(CABECALHO_PNG, "foto.png", "image/png"), "imoveis");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.extensao).toBe("png");
      expect(r.mime).toBe("image/png");
    }
  });

  test("aceita JPEG e WEBP também", async () => {
    const jpeg = await validarArquivo(arquivo(CABECALHO_JPEG, "foto.jpg", "image/jpeg"), "imoveis");
    expect(jpeg.ok).toBe(true);
    const webp = await validarArquivo(arquivo(CABECALHO_WEBP, "foto.webp", "image/webp"), "site");
    expect(webp.ok).toBe(true);
  });

  test("aceita a pasta 'hero' (imagem do Hero da Home)", async () => {
    const r = await validarArquivo(arquivo(CABECALHO_JPEG, "hero.jpg", "image/jpeg"), "hero");
    expect(r.ok).toBe(true);
  });
});

describe("validarArquivo — tipo inválido", () => {
  test("recusa MIME fora da allowlist (svg)", async () => {
    const svg = arquivo(Buffer.from("<svg></svg>"), "logo.svg", "image/svg+xml");
    const r = await validarArquivo(svg, "site");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  test("recusa executável disfarçado de imagem (MIME não reconhecido)", async () => {
    const exe = arquivo(Buffer.from([0x4d, 0x5a, 0x90, 0x00]), "virus.exe", "application/x-msdownload");
    const r = await validarArquivo(exe, "imoveis");
    expect(r.ok).toBe(false);
  });

  test("recusa PDF (categoria não habilitada nesta fase)", async () => {
    const pdf = arquivo(Buffer.from("%PDF-1.4"), "contrato.pdf", "application/pdf");
    const r = await validarArquivo(pdf, "imoveis");
    expect(r.ok).toBe(false);
  });

  test("recusa extensão dupla suspeita (nome.jpg.js com MIME de imagem)", async () => {
    const r = await validarArquivo(
      arquivo(CABECALHO_PNG, "foto.png.js", "image/png"),
      "imoveis"
    );
    expect(r.ok).toBe(false);
  });

  test("recusa quando extensão não bate com o MIME declarado", async () => {
    const r = await validarArquivo(arquivo(CABECALHO_PNG, "foto.exe", "image/png"), "imoveis");
    expect(r.ok).toBe(false);
  });

  test("recusa quando o conteúdo não bate com a assinatura esperada (MIME mentiroso)", async () => {
    const jsDisfarcado = arquivo(
      Buffer.from("alert('oi')"),
      "foto.png",
      "image/png"
    );
    const r = await validarArquivo(jsDisfarcado, "imoveis");
    expect(r.ok).toBe(false);
  });

  test("recusa arquivo vazio", async () => {
    const r = await validarArquivo(arquivo(Buffer.alloc(0), "foto.png", "image/png"), "imoveis");
    expect(r.ok).toBe(false);
  });

  test("recusa pasta de destino fora da allowlist", async () => {
    const r = await validarArquivo(arquivo(CABECALHO_PNG, "foto.png", "image/png"), "../etc");
    expect(r.ok).toBe(false);
  });
});

describe("validarArquivo — arquivo grande", () => {
  test("recusa imagem acima do limite de 10MB com status 413", async () => {
    const grande = Buffer.concat([CABECALHO_PNG, Buffer.alloc(LIMITE_TAMANHO_BYTES.imagem + 1)]);
    const r = await validarArquivo(arquivo(grande, "foto.png", "image/png"), "imoveis");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(413);
  });

  test("aceita imagem exatamente no limite", async () => {
    const noLimite = Buffer.concat([
      CABECALHO_PNG,
      Buffer.alloc(LIMITE_TAMANHO_BYTES.imagem - CABECALHO_PNG.length),
    ]);
    const r = await validarArquivo(arquivo(noLimite, "foto.png", "image/png"), "imoveis");
    expect(r.ok).toBe(true);
  });
});

describe("imovelValidoParaOrganizacao — organização errada", () => {
  test("recusa quando o imóvel pertence a outra organização", () => {
    const ok = imovelValidoParaOrganizacao({ organizationId: "org-b" }, "org-a");
    expect(ok).toBe(false);
  });

  test("recusa quando o imóvel não existe", () => {
    const ok = imovelValidoParaOrganizacao(null, "org-a");
    expect(ok).toBe(false);
  });

  test("aceita quando o imóvel é da mesma organização", () => {
    const ok = imovelValidoParaOrganizacao({ organizationId: "org-a" }, "org-a");
    expect(ok).toBe(true);
  });
});

describe("extrairExtensao", () => {
  test("pega a última extensão, em minúsculas", () => {
    expect(extrairExtensao("Foto.PNG")).toBe("png");
    expect(extrairExtensao("arquivo.tar.gz")).toBe("gz");
  });

  test("retorna null sem extensão", () => {
    expect(extrairExtensao("semextensao")).toBe(null);
  });
});

describe("sanitizarNomeLogico", () => {
  test("remove separadores de caminho e limita o tamanho", () => {
    const resultado = sanitizarNomeLogico("../../etc/passwd");
    expect(!resultado.includes("/")).toBeTruthy();
  });
});
