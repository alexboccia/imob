import { describe, test, expect, afterEach, vi } from "vitest";
import { construirHeadersSeguranca } from "@/lib/security-headers";

// CSP e cabeçalhos de segurança (cobertura adicionada na Fase 14).
//
// A Fase 13 delimitou a divergência entre o build de teste do CI
// (NODE_ENV=test) e o de produção, e registrou que a CSP de produção não
// era exercida por teste NENHUM. Este arquivo fecha essa parte da dívida.
//
// Testa a FUNÇÃO PURA, não o navegador: `construirHeadersSeguranca` é o
// contrato público do módulo (construirCsp é privado, e exportá-lo só
// para o teste alargaria a superfície à toa). O modo de produção é
// alcançado com vi.stubEnv, sem tocar no código.
//
// NÃO congela a string inteira da CSP — isso tornaria o teste frágil a
// qualquer host novo legítimo. Afirma as INVARIANTES que importam.

function csp(headers: { key: string; value: string }[]): string {
  return headers.find((h) => h.key === "Content-Security-Policy")!.value;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cabeçalhos sempre presentes", () => {
  test("nosniff, referrer, permissions e anti-clickjacking em qualquer ambiente", () => {
    const headers = construirHeadersSeguranca();
    const porChave = Object.fromEntries(headers.map((h) => [h.key, h.value]));
    expect(porChave["X-Content-Type-Options"]).toBe("nosniff");
    expect(porChave["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(porChave["X-Frame-Options"]).toBe("DENY");
    expect(porChave["Permissions-Policy"]).toContain("camera=()");
    expect(porChave["Content-Security-Policy"]).toBeDefined();
  });

  test("diretivas de contenção não dependem do ambiente", () => {
    for (const ambiente of ["production", "test"]) {
      vi.stubEnv("NODE_ENV", ambiente);
      const politica = csp(construirHeadersSeguranca());
      // X-Frame-Options cobre navegador antigo; frame-ancestors, o novo.
      expect(politica).toContain("frame-ancestors 'none'");
      expect(politica).toContain("object-src 'none'");
      expect(politica).toContain("base-uri 'self'");
      expect(politica).toContain("form-action 'self'");
      expect(politica).toContain("default-src 'self'");
      vi.unstubAllEnvs();
    }
  });
});

describe("produção", () => {
  test("script-src NÃO libera unsafe-eval", () => {
    vi.stubEnv("NODE_ENV", "production");
    const politica = csp(construirHeadersSeguranca());
    const scriptSrc = politica.split("; ").find((d) => d.startsWith("script-src"))!;
    // A diferença que realmente importa entre os dois modos: o React em
    // dev usa eval() para reconstruir stack trace, produção nunca.
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).toContain("'self'");
  });

  test("força upgrade de requisições inseguras", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(csp(construirHeadersSeguranca())).toContain("upgrade-insecure-requests");
  });

  test("HSTS presente, com preload e subdomínios", () => {
    vi.stubEnv("NODE_ENV", "production");
    const hsts = construirHeadersSeguranca().find(
      (h) => h.key === "Strict-Transport-Security"
    );
    expect(hsts).toBeDefined();
    expect(hsts!.value).toContain("includeSubDomains");
    expect(hsts!.value).toContain("preload");
    expect(hsts!.value).toMatch(/max-age=\d{7,}/);
  });
});

describe("fora de produção", () => {
  test("unsafe-eval é liberado (React em dev usa eval para stack trace)", () => {
    vi.stubEnv("NODE_ENV", "test");
    const scriptSrc = csp(construirHeadersSeguranca())
      .split("; ")
      .find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).toContain("'unsafe-eval'");
  });

  test("sem HSTS e sem upgrade-insecure-requests — não há HTTPS em localhost", () => {
    vi.stubEnv("NODE_ENV", "test");
    const headers = construirHeadersSeguranca();
    expect(headers.find((h) => h.key === "Strict-Transport-Security")).toBeUndefined();
    expect(csp(headers)).not.toContain("upgrade-insecure-requests");
  });
});
