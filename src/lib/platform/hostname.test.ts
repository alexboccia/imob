import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { normalizarHostname, hostnameReservado, hostnameInstitucional } from "@/lib/platform/hostname";

describe("normalizarHostname", () => {
  test("uppercase é normalizado pra lowercase", () => {
    expect(normalizarHostname("WWW.XYZ.COM.BR")).toBe("www.xyz.com.br");
  });

  test("hostname simples já normalizado passa direto", () => {
    expect(normalizarHostname("www.xyz.com.br")).toBe("www.xyz.com.br");
  });

  test("rejeita protocolo (não stripa silenciosamente)", () => {
    expect(normalizarHostname("https://www.xyz.com.br")).toBeNull();
    expect(normalizarHostname("http://www.xyz.com.br")).toBeNull();
  });

  test("rejeita trailing slash / path", () => {
    expect(normalizarHostname("www.xyz.com.br/")).toBeNull();
    expect(normalizarHostname("www.xyz.com.br/imoveis")).toBeNull();
  });

  test("rejeita query string e fragment", () => {
    expect(normalizarHostname("www.xyz.com.br?a=1")).toBeNull();
    expect(normalizarHostname("www.xyz.com.br#topo")).toBeNull();
  });

  test("localhost com porta vira 'localhost' — tratamento local explícito", () => {
    expect(normalizarHostname("localhost:3000")).toBe("localhost");
  });

  test("hostname com porta remove a porta", () => {
    expect(normalizarHostname("www.xyz.com.br:443")).toBe("www.xyz.com.br");
  });

  test("remove um único trailing dot (FQDN absoluta)", () => {
    expect(normalizarHostname("www.xyz.com.br.")).toBe("www.xyz.com.br");
  });

  test("rejeita wildcard arbitrário", () => {
    expect(normalizarHostname("*.xyz.com.br")).toBeNull();
    expect(normalizarHostname("*")).toBeNull();
  });

  test("rejeita IP literal (IPv4)", () => {
    expect(normalizarHostname("192.168.0.1")).toBeNull();
    expect(normalizarHostname("8.8.8.8")).toBeNull();
  });

  test("rejeita string vazia ou só espaços", () => {
    expect(normalizarHostname("")).toBeNull();
    expect(normalizarHostname("   ")).toBeNull();
  });

  test("rejeita label com caractere inválido", () => {
    expect(normalizarHostname("www.xy_z.com.br")).toBeNull();
    expect(normalizarHostname("www.x z.com.br")).toBeNull();
  });

  test("rejeita label começando ou terminando com hífen", () => {
    expect(normalizarHostname("-xyz.com.br")).toBeNull();
    expect(normalizarHostname("xyz-.com.br")).toBeNull();
  });

  test("aceita hífen no meio do label", () => {
    expect(normalizarHostname("imoveis-xyz.com.br")).toBe("imoveis-xyz.com.br");
  });

  test("trim de espaços nas bordas", () => {
    expect(normalizarHostname("  www.xyz.com.br  ")).toBe("www.xyz.com.br");
  });
});

describe("hostnameReservado", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalBase = process.env.PUBLIC_ORG_SUBDOMAIN_BASE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://syntaks.ondigitalocean.app";
    process.env.PUBLIC_ORG_SUBDOMAIN_BASE = "syntaks.com.br";
  });

  afterEach(() => {
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    if (originalBase === undefined) delete process.env.PUBLIC_ORG_SUBDOMAIN_BASE;
    else process.env.PUBLIC_ORG_SUBDOMAIN_BASE = originalBase;
  });

  test("localhost é sempre reservado", () => {
    expect(hostnameReservado("localhost")).toBe(true);
    expect(hostnameReservado("127.0.0.1")).toBe(true);
  });

  test("origin da DigitalOcean é sempre reservado", () => {
    expect(hostnameReservado("ondigitalocean.app")).toBe(true);
    expect(hostnameReservado("minhaapp.ondigitalocean.app")).toBe(true);
  });

  test("domínio oficial (NEXT_PUBLIC_SITE_URL) é reservado", () => {
    expect(hostnameReservado("syntaks.ondigitalocean.app")).toBe(true);
  });

  test("labels reservados sob o domínio-base de subdomínio são bloqueados", () => {
    expect(hostnameReservado("app.syntaks.com.br")).toBe(true);
    expect(hostnameReservado("platform.syntaks.com.br")).toBe(true);
    expect(hostnameReservado("www.syntaks.com.br")).toBe(true);
  });

  test("subdomínio de organização legítimo NÃO é reservado", () => {
    expect(hostnameReservado("xyz.syntaks.com.br")).toBe(false);
  });

  test("domínio de cliente completamente externo não é reservado", () => {
    expect(hostnameReservado("www.xyz.com.br")).toBe(false);
  });

  test("sem PUBLIC_ORG_SUBDOMAIN_BASE configurado, não quebra e não reserva subdomínios", () => {
    delete process.env.PUBLIC_ORG_SUBDOMAIN_BASE;
    expect(hostnameReservado("xyz.syntaks.com.br")).toBe(false);
    expect(hostnameReservado("localhost")).toBe(true);
  });

  test("NEXT_PUBLIC_SITE_URL malformado nunca quebra a checagem", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not-a-valid-url";
    expect(() => hostnameReservado("www.xyz.com.br")).not.toThrow();
    expect(hostnameReservado("www.xyz.com.br")).toBe(false);
  });
});

describe("hostnameInstitucional", () => {
  const originalUrl = process.env.NEXT_PUBLIC_INSTITUTIONAL_URL;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_INSTITUTIONAL_URL;
    else process.env.NEXT_PUBLIC_INSTITUTIONAL_URL = originalUrl;
  });

  test("sem NEXT_PUBLIC_INSTITUTIONAL_URL configurado, nunca reconhece nenhum host", () => {
    delete process.env.NEXT_PUBLIC_INSTITUTIONAL_URL;
    expect(hostnameInstitucional("syntaks.com.br")).toBe(false);
  });

  test("reconhece o host exato configurado", () => {
    process.env.NEXT_PUBLIC_INSTITUTIONAL_URL = "https://syntaks.com.br";
    expect(hostnameInstitucional("syntaks.com.br")).toBe(true);
  });

  test("reconhece a variante www.", () => {
    process.env.NEXT_PUBLIC_INSTITUTIONAL_URL = "https://syntaks.com.br";
    expect(hostnameInstitucional("www.syntaks.com.br")).toBe(true);
  });

  test("não reconhece subdomínio arbitrário (continua candidato a domínio de organização)", () => {
    process.env.NEXT_PUBLIC_INSTITUTIONAL_URL = "https://syntaks.com.br";
    expect(hostnameInstitucional("xyz.syntaks.com.br")).toBe(false);
    expect(hostnameInstitucional("demo.syntaks.com.br")).toBe(false);
  });

  test("não reconhece domínio completamente diferente", () => {
    process.env.NEXT_PUBLIC_INSTITUTIONAL_URL = "https://syntaks.com.br";
    expect(hostnameInstitucional("www.xyz.com.br")).toBe(false);
  });

  test("NEXT_PUBLIC_INSTITUTIONAL_URL malformado nunca quebra a checagem", () => {
    process.env.NEXT_PUBLIC_INSTITUTIONAL_URL = "not-a-valid-url";
    expect(() => hostnameInstitucional("syntaks.com.br")).not.toThrow();
    expect(hostnameInstitucional("syntaks.com.br")).toBe(false);
  });
});
