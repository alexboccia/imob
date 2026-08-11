import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { validarFaviconUrl } from "@/lib/branding/favicon-url";

const R2_PUBLIC_URL_TESTE = "https://pub-test123.r2.dev";
const ORG_ID = "org-abc123";
const UUID_VALIDO = "11111111-2222-3333-4444-555555555555";

describe("validarFaviconUrl", () => {
  beforeEach(() => {
    vi.stubEnv("R2_PUBLIC_URL", R2_PUBLIC_URL_TESTE);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("favicon válido do próprio tenant é aceito", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/${ORG_ID}/site/${UUID_VALIDO}.png`;
    expect(validarFaviconUrl(url, ORG_ID)).toBe(true);
  });

  test("aceita as 3 extensões permitidas (png/jpg/webp)", () => {
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      const url = `${R2_PUBLIC_URL_TESTE}/${ORG_ID}/site/${UUID_VALIDO}.${ext}`;
      expect(validarFaviconUrl(url, ORG_ID)).toBe(true);
    }
  });

  test("favicon de outra organização é rejeitado", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/outra-org-999/site/${UUID_VALIDO}.png`;
    expect(validarFaviconUrl(url, ORG_ID)).toBe(false);
  });

  test("URL externa arbitrária é rejeitada", () => {
    const url = `https://attacker.com/${ORG_ID}/site/${UUID_VALIDO}.png`;
    expect(validarFaviconUrl(url, ORG_ID)).toBe(false);
  });

  test("URL com host prefixo parecido mas origin diferente é rejeitada (sem prefix collision)", () => {
    // host começa com o mesmo texto do host oficial, mas é outro domínio —
    // um startsWith ingênuo na string crua passaria por aqui.
    const url = `https://pub-test123.r2.dev.attacker.com/${ORG_ID}/site/${UUID_VALIDO}.png`;
    expect(validarFaviconUrl(url, ORG_ID)).toBe(false);
  });

  test("mesmo host mas scheme diferente (http em vez de https) é rejeitado", () => {
    const url = `http://pub-test123.r2.dev/${ORG_ID}/site/${UUID_VALIDO}.png`;
    expect(validarFaviconUrl(url, ORG_ID)).toBe(false);
  });

  test("pasta diferente de 'site' é rejeitada", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/${ORG_ID}/imoveis/${UUID_VALIDO}.png`;
    expect(validarFaviconUrl(url, ORG_ID)).toBe(false);
  });

  test("nome de arquivo fora do padrão uuid.extensão é rejeitado", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/${ORG_ID}/site/qualquer-coisa.png`;
    expect(validarFaviconUrl(url, ORG_ID)).toBe(false);
  });

  test("extensão fora da allowlist (svg) é rejeitada", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/${ORG_ID}/site/${UUID_VALIDO}.svg`;
    expect(validarFaviconUrl(url, ORG_ID)).toBe(false);
  });

  test("string que não é uma URL válida é rejeitada", () => {
    expect(validarFaviconUrl("nao-e-uma-url", ORG_ID)).toBe(false);
  });

  test("path traversal (..) não escapa o prefixo do tenant", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/${ORG_ID}/site/../outra-org-999/site/${UUID_VALIDO}.png`;
    expect(validarFaviconUrl(url, ORG_ID)).toBe(false);
  });

  test("sem R2_PUBLIC_URL configurado, tudo é rejeitado", () => {
    vi.stubEnv("R2_PUBLIC_URL", "");
    const url = `${R2_PUBLIC_URL_TESTE}/${ORG_ID}/site/${UUID_VALIDO}.png`;
    expect(validarFaviconUrl(url, ORG_ID)).toBe(false);
  });
});
