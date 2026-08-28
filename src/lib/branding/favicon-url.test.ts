import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { validarFaviconUrl, validarUrlMidiaOrganizacao } from "@/lib/branding/favicon-url";

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

// validarUrlMidiaOrganizacao é a mesma checagem generalizada (usada
// também pra validar o logo antes de buscá-lo no servidor pra gerar a
// paleta automática, ver extrair-paleta-logo.ts) — validarFaviconUrl é
// hoje só um wrapper dela, então a bateria abaixo espelha a de cima
// (nenhum comportamento novo, só um nome de função mais genérico).
describe("validarUrlMidiaOrganizacao — mesma checagem, uso genérico (logo/logo do rodapé/favicon)", () => {
  beforeEach(() => {
    vi.stubEnv("R2_PUBLIC_URL", R2_PUBLIC_URL_TESTE);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("asset válido do próprio tenant é aceito", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/${ORG_ID}/site/${UUID_VALIDO}.webp`;
    expect(validarUrlMidiaOrganizacao(url, ORG_ID)).toBe(true);
  });

  test("asset de outra organização é rejeitado (isolamento de tenant no nível de URL)", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/outra-org-999/site/${UUID_VALIDO}.png`;
    expect(validarUrlMidiaOrganizacao(url, ORG_ID)).toBe(false);
  });

  test("URL externa arbitrária é rejeitada (defesa contra SSRF)", () => {
    const url = `https://attacker.com/${ORG_ID}/site/${UUID_VALIDO}.png`;
    expect(validarUrlMidiaOrganizacao(url, ORG_ID)).toBe(false);
  });

  test("host com prefixo parecido mas origin diferente é rejeitado", () => {
    const url = `https://pub-test123.r2.dev.attacker.com/${ORG_ID}/site/${UUID_VALIDO}.png`;
    expect(validarUrlMidiaOrganizacao(url, ORG_ID)).toBe(false);
  });

  test("pasta diferente de 'site' é rejeitada", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/${ORG_ID}/imoveis/${UUID_VALIDO}.png`;
    expect(validarUrlMidiaOrganizacao(url, ORG_ID)).toBe(false);
  });

  test("string que não é URL é rejeitada", () => {
    expect(validarUrlMidiaOrganizacao("não-é-url", ORG_ID)).toBe(false);
  });
});

// Parâmetro `pasta` (usado pela imagem do Hero, pasta "hero") — mesma
// checagem, prefixo diferente. "site" continua o padrão implícito (todo
// call site pré-existente passa a funcionar sem alterações).
describe("validarUrlMidiaOrganizacao — parâmetro pasta (imagem do Hero)", () => {
  beforeEach(() => {
    vi.stubEnv("R2_PUBLIC_URL", R2_PUBLIC_URL_TESTE);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("aceita asset do próprio tenant na pasta 'hero' quando pasta='hero' é passada", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/${ORG_ID}/hero/${UUID_VALIDO}.webp`;
    expect(validarUrlMidiaOrganizacao(url, ORG_ID, "hero")).toBe(true);
  });

  test("URL na pasta 'hero' é rejeitada quando validada com o padrão (pasta='site')", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/${ORG_ID}/hero/${UUID_VALIDO}.webp`;
    expect(validarUrlMidiaOrganizacao(url, ORG_ID)).toBe(false);
  });

  test("URL na pasta 'site' é rejeitada quando validada explicitamente contra 'hero'", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/${ORG_ID}/site/${UUID_VALIDO}.webp`;
    expect(validarUrlMidiaOrganizacao(url, ORG_ID, "hero")).toBe(false);
  });

  test("isolamento de tenant continua valendo com pasta explícita", () => {
    const url = `${R2_PUBLIC_URL_TESTE}/outra-org-999/hero/${UUID_VALIDO}.webp`;
    expect(validarUrlMidiaOrganizacao(url, ORG_ID, "hero")).toBe(false);
  });
});
