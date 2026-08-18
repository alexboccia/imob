import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario, criarPlatformOperator, destruirPlatformOperator } from "@/test/fixtures";
import {
  resolverOrgSlugPorHostname,
  buscarHostnameCustomAtivo,
  resolverOrigemPublicacao,
} from "@/lib/platform/organization-domain";
import { resolverOnboarding } from "@/lib/platform/onboarding";

// Mesmo padrão de tests/integration/platform-plans.test.ts — reimplementa
// requirePlatformOperator no mock com a MESMA lógica real (checagem
// contra Postgres), nunca um atalho que mascare bug de autorização.
const mockAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform/auth", () => ({
  auth: mockAuth,
  requirePlatformOperator: async () => {
    const { redirect } = await import("next/navigation");
    const { prisma } = await import("@/lib/prisma");
    const session = await mockAuth();
    if (!session?.user?.platformOperatorId) {
      redirect("/platform/login");
      throw new Error("NEXT_REDIRECT (mock): sem sessão/operador válido");
    }
    const operador = await prisma.platformOperator.findUnique({
      where: { id: session.user.platformOperatorId },
      select: { id: true, role: true, active: true },
    });
    if (!operador || !operador.active) {
      redirect("/platform/login");
      throw new Error("NEXT_REDIRECT (mock): sem sessão/operador válido");
    }
    return { id: operador.id, role: operador.role };
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@/lib/platform/auth";
import {
  adicionarDominio,
  atualizarStatusDominio,
  removerDominio,
  salvarEmailDomain,
} from "@/app/platform/organizations/[id]/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

function formData(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

async function autenticarComoOperador() {
  const operador = await criarPlatformOperator({ role: "SUPER_ADMIN" });
  vi.mocked(auth).mockResolvedValue({
    user: { platformOperatorId: operador.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return operador;
}

describe("Fase P.10 — OrganizationDomain: unicidade e resolução", () => {
  let operadorId: string | undefined;
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (operadorId) await destruirPlatformOperator(operadorId);
    operadorId = undefined;
  });

  test("A) hostname é único globalmente — segunda organização não pode reivindicar o mesmo hostname", async () => {
    const cenarioA = await criarCenario();
    const cenarioB = await criarCenario();
    try {
      await prisma.organizationDomain.create({
        data: {
          organizationId: cenarioA.organization.id,
          hostname: "www.duplicado-teste.test",
          type: "CUSTOM",
          status: "ACTIVE",
          verificationToken: "token-a",
        },
      });

      await expect(
        prisma.organizationDomain.create({
          data: {
            organizationId: cenarioB.organization.id,
            hostname: "www.duplicado-teste.test",
            type: "CUSTOM",
            status: "ACTIVE",
            verificationToken: "token-b",
          },
        })
      ).rejects.toThrow();
    } finally {
      await cenarioA.destruir();
      await cenarioB.destruir();
    }
  });

  test("B/C/F) domain A resolve org A, domain B resolve org B, nunca cruzado", async () => {
    const cenarioA = await criarCenario();
    const cenarioB = await criarCenario();
    try {
      await prisma.organizationDomain.create({
        data: {
          organizationId: cenarioA.organization.id,
          hostname: "a.dominio-teste.test",
          type: "CUSTOM",
          status: "ACTIVE",
          verificationToken: "token-a",
        },
      });
      await prisma.organizationDomain.create({
        data: {
          organizationId: cenarioB.organization.id,
          hostname: "b.dominio-teste.test",
          type: "CUSTOM",
          status: "ACTIVE",
          verificationToken: "token-b",
        },
      });

      const slugA = await resolverOrgSlugPorHostname("a.dominio-teste.test");
      const slugB = await resolverOrgSlugPorHostname("b.dominio-teste.test");

      expect(slugA).toBe(cenarioA.organization.slug);
      expect(slugB).toBe(cenarioB.organization.slug);
      expect(slugA).not.toBe(slugB);
    } finally {
      await cenarioA.destruir();
      await cenarioB.destruir();
    }
  });

  test("D) domínio PENDING nunca resolve como tenant ativo", async () => {
    const cenario = await criarCenario();
    try {
      await prisma.organizationDomain.create({
        data: {
          organizationId: cenario.organization.id,
          hostname: "pendente.dominio-teste.test",
          type: "CUSTOM",
          status: "PENDING",
          verificationToken: "token-pendente",
        },
      });
      expect(await resolverOrgSlugPorHostname("pendente.dominio-teste.test")).toBeNull();
    } finally {
      await cenario.destruir();
    }
  });

  test("E) domínio DISABLED nunca resolve como tenant ativo", async () => {
    const cenario = await criarCenario();
    try {
      await prisma.organizationDomain.create({
        data: {
          organizationId: cenario.organization.id,
          hostname: "desabilitado.dominio-teste.test",
          type: "CUSTOM",
          status: "DISABLED",
          verificationToken: "token-disabled",
        },
      });
      expect(await resolverOrgSlugPorHostname("desabilitado.dominio-teste.test")).toBeNull();
    } finally {
      await cenario.destruir();
    }
  });

  test("FAILED nunca resolve, VERIFIED resolve (mesma regra de ACTIVE)", async () => {
    const cenario = await criarCenario();
    try {
      const dominio = await prisma.organizationDomain.create({
        data: {
          organizationId: cenario.organization.id,
          hostname: "verificado.dominio-teste.test",
          type: "CUSTOM",
          status: "FAILED",
          verificationToken: "token-failed",
        },
      });
      expect(await resolverOrgSlugPorHostname("verificado.dominio-teste.test")).toBeNull();

      await prisma.organizationDomain.update({ where: { id: dominio.id }, data: { status: "VERIFIED" } });
      expect(await resolverOrgSlugPorHostname("verificado.dominio-teste.test")).toBe(cenario.organization.slug);
    } finally {
      await cenario.destruir();
    }
  });

  test("K) resolverOrgSlugPorHostname nunca escreve no banco (só leitura)", async () => {
    const cenario = await criarCenario();
    try {
      const dominio = await prisma.organizationDomain.create({
        data: {
          organizationId: cenario.organization.id,
          hostname: "somente-leitura.dominio-teste.test",
          type: "CUSTOM",
          status: "ACTIVE",
          verificationToken: "token-ro",
        },
      });

      await resolverOrgSlugPorHostname("somente-leitura.dominio-teste.test");
      await resolverOrgSlugPorHostname("somente-leitura.dominio-teste.test");

      const total = await prisma.organizationDomain.count({ where: { organizationId: cenario.organization.id } });
      expect(total).toBe(1);
      const depois = await prisma.organizationDomain.findUniqueOrThrow({ where: { id: dominio.id } });
      expect(depois.updatedAt.getTime()).toBe(dominio.updatedAt.getTime());
    } finally {
      await cenario.destruir();
    }
  });
});

describe("Fase P.10 — Platform Admin: ações de domínio", () => {
  let operadorId: string | undefined;
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (operadorId) await destruirPlatformOperator(operadorId);
    operadorId = undefined;
  });

  test("M) Platform Admin consegue adicionar um subdomínio easymob (sem depender de módulo do plano)", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const cenario = await criarCenario(); // plano padrão, SEM módulo custom-domain
    try {
      const resultado = await adicionarDominio(
        cenario.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({ hostname: "xyz.easymob-teste.com.br", type: "EASYMOB_SUBDOMAIN" })
      );
      expect(resultado.success).toBe(true);

      const dominio = await prisma.organizationDomain.findUnique({
        where: { hostname: "xyz.easymob-teste.com.br" },
      });
      expect(dominio).not.toBeNull();
      expect(dominio?.status).toBe("PENDING");
      expect(dominio?.type).toBe("EASYMOB_SUBDOMAIN");
    } finally {
      await cenario.destruir();
    }
  });

  test("entitlement: domínio CUSTOM é recusado sem o módulo 'custom-domain' no plano", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const cenario = await criarCenario(); // módulos padrão: core, properties — sem custom-domain
    try {
      const resultado = await adicionarDominio(
        cenario.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({ hostname: "www.sem-plano.test", type: "CUSTOM" })
      );
      expect(resultado.success).toBe(false);
      expect(await prisma.organizationDomain.findUnique({ where: { hostname: "www.sem-plano.test" } })).toBeNull();
    } finally {
      await cenario.destruir();
    }
  });

  test("entitlement: domínio CUSTOM é aceito com o módulo 'custom-domain' habilitado", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const cenario = await criarCenario({ modulos: ["core", "properties", "custom-domain"] });
    try {
      const resultado = await adicionarDominio(
        cenario.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({ hostname: "www.com-plano.test", type: "CUSTOM" })
      );
      expect(resultado.success).toBe(true);
    } finally {
      await cenario.destruir();
    }
  });

  test("N) domínio duplicado é rejeitado (mesma organização ou outra)", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const cenarioA = await criarCenario({ modulos: ["core", "properties", "custom-domain"] });
    const cenarioB = await criarCenario({ modulos: ["core", "properties", "custom-domain"] });
    try {
      const primeira = await adicionarDominio(
        cenarioA.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({ hostname: "www.ja-existe.test", type: "CUSTOM" })
      );
      expect(primeira.success).toBe(true);

      const segunda = await adicionarDominio(
        cenarioB.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({ hostname: "www.ja-existe.test", type: "CUSTOM" })
      );
      expect(segunda.success).toBe(false);
    } finally {
      await cenarioA.destruir();
      await cenarioB.destruir();
    }
  });

  test("O) normalização impede duplicata por maiúsculas/porta/protocolo", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const cenarioA = await criarCenario({ modulos: ["core", "properties", "custom-domain"] });
    const cenarioB = await criarCenario({ modulos: ["core", "properties", "custom-domain"] });
    try {
      const primeira = await adicionarDominio(
        cenarioA.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({ hostname: "www.MaiusculoTeste.com.br", type: "CUSTOM" })
      );
      expect(primeira.success).toBe(true);

      const segunda = await adicionarDominio(
        cenarioB.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({ hostname: "WWW.MAIUSCULOTESTE.COM.BR:443", type: "CUSTOM" })
      );
      expect(segunda.success).toBe(false);

      const registro = await prisma.organizationDomain.findUnique({
        where: { hostname: "www.maiusculoteste.com.br" },
      });
      expect(registro).not.toBeNull();
      expect(registro?.organizationId).toBe(cenarioA.organization.id);
    } finally {
      await cenarioA.destruir();
      await cenarioB.destruir();
    }
  });

  test("hostname reservado é recusado no cadastro", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const cenario = await criarCenario({ modulos: ["core", "properties", "custom-domain"] });
    try {
      const resultado = await adicionarDominio(
        cenario.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({ hostname: "localhost", type: "CUSTOM" })
      );
      expect(resultado.success).toBe(false);
    } finally {
      await cenario.destruir();
    }
  });

  test("G) remover domínio não apaga a organização nem nenhum outro dado", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const cenario = await criarCenario({ modulos: ["core", "properties", "custom-domain"] });
    try {
      await adicionarDominio(
        cenario.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({ hostname: "www.remover-teste.test", type: "CUSTOM" })
      );
      const dominio = await prisma.organizationDomain.findUniqueOrThrow({
        where: { hostname: "www.remover-teste.test" },
      });

      await removerDominio(dominio.id);

      expect(await prisma.organizationDomain.findUnique({ where: { id: dominio.id } })).toBeNull();
      const organizacaoAinda = await prisma.organization.findUnique({ where: { id: cenario.organization.id } });
      expect(organizacaoAinda).not.toBeNull();
    } finally {
      await cenario.destruir();
    }
  });

  test("J) atualizarStatusDominio grava PlatformAuditLog com a ação correta", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const cenario = await criarCenario({ modulos: ["core", "properties", "custom-domain"] });
    try {
      await adicionarDominio(
        cenario.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({ hostname: "www.audit-teste.test", type: "CUSTOM" })
      );
      const dominio = await prisma.organizationDomain.findUniqueOrThrow({
        where: { hostname: "www.audit-teste.test" },
      });

      const logAdicionado = await prisma.platformAuditLog.findFirst({
        where: { action: "DOMAIN_ADDED", entityId: dominio.id },
      });
      expect(logAdicionado).not.toBeNull();

      await atualizarStatusDominio(dominio.id, ESTADO_INICIAL_ACAO, formData({ status: "ACTIVE" }));

      const logVerificado = await prisma.platformAuditLog.findFirst({
        where: { action: "DOMAIN_VERIFIED", entityId: dominio.id },
      });
      expect(logVerificado).not.toBeNull();

      const atualizado = await prisma.organizationDomain.findUniqueOrThrow({ where: { id: dominio.id } });
      expect(atualizado.status).toBe("ACTIVE");
      expect(atualizado.verifiedAt).not.toBeNull();
    } finally {
      await cenario.destruir();
    }
  });
});

describe("Fase P.10 — E-mail transacional: isolamento e entitlement", () => {
  let operadorId: string | undefined;
  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (operadorId) await destruirPlatformOperator(operadorId);
    operadorId = undefined;
  });

  test("I) config de e-mail da organização A nunca aparece pra organização B", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const cenarioA = await criarCenario({ modulos: ["core", "properties", "email-domain"] });
    const cenarioB = await criarCenario({ modulos: ["core", "properties", "email-domain"] });
    try {
      await salvarEmailDomain(
        cenarioA.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({
          domain: "mail.isolamento-teste.test",
          fromName: "Organização A",
          fromAddress: "contato@mail.isolamento-teste.test",
        })
      );

      const emailB = await prisma.organizationEmailDomain.findUnique({
        where: { organizationId: cenarioB.organization.id },
      });
      expect(emailB).toBeNull();

      const emailA = await prisma.organizationEmailDomain.findUnique({
        where: { organizationId: cenarioA.organization.id },
      });
      expect(emailA?.fromAddress).toBe("contato@mail.isolamento-teste.test");
    } finally {
      await cenarioA.destruir();
      await cenarioB.destruir();
    }
  });

  test("entitlement: domínio de e-mail é recusado sem o módulo 'email-domain'", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const cenario = await criarCenario(); // sem email-domain
    try {
      const resultado = await salvarEmailDomain(
        cenario.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({
          domain: "mail.sem-plano.test",
          fromName: "Teste",
          fromAddress: "contato@mail.sem-plano.test",
        })
      );
      expect(resultado.success).toBe(false);
    } finally {
      await cenario.destruir();
    }
  });

  test("fromAddress precisa terminar em @domain", async () => {
    const operador = await autenticarComoOperador();
    operadorId = operador.id;
    const cenario = await criarCenario({ modulos: ["core", "properties", "email-domain"] });
    try {
      const resultado = await salvarEmailDomain(
        cenario.organization.id,
        ESTADO_INICIAL_ACAO,
        formData({
          domain: "mail.consistencia-teste.test",
          fromName: "Teste",
          fromAddress: "contato@outro-dominio.test",
        })
      );
      expect(resultado.success).toBe(false);
    } finally {
      await cenario.destruir();
    }
  });
});

describe("Fase P.10 — Onboarding (integração com o banco)", () => {
  test("Q) owner ainda INVITED -> PENDENTE_OWNER; owner ACTIVE sem domínio/e-mail -> PRONTO", async () => {
    const cenario = await criarCenario();
    try {
      // criarMembro (via criarCenario) não define status explicitamente —
      // usa o default do schema. Força INVITED pra testar o branch.
      await prisma.organizationMember.update({
        where: { id: cenario.membro.id },
        data: { status: "INVITED" },
      });
      const pendente = await resolverOnboarding(cenario.organization.id);
      expect(pendente.publicationStatus).toBe("PENDENTE_OWNER");

      await prisma.organizationMember.update({
        where: { id: cenario.membro.id },
        data: { status: "ACTIVE" },
      });
      const pronto = await resolverOnboarding(cenario.organization.id);
      expect(pronto.publicationStatus).toBe("PRONTO");
    } finally {
      await cenario.destruir();
    }
  });
});

describe("Correção AU — buscarHostnameCustomAtivo (SEO: só ACTIVE conta)", () => {
  const STATUS_NAO_CONTAM: Array<"PENDING" | "VERIFIED" | "FAILED" | "DISABLED"> = [
    "PENDING",
    "VERIFIED",
    "FAILED",
    "DISABLED",
  ];

  test.each(STATUS_NAO_CONTAM)("status %s nunca vira canonical (só ACTIVE conta)", async (status) => {
    const cenario = await criarCenario();
    try {
      await prisma.organizationDomain.create({
        data: {
          organizationId: cenario.organization.id,
          hostname: `au-${status.toLowerCase()}.dominio-teste.test`,
          type: "CUSTOM",
          status,
          verificationToken: `token-au-${status}`,
        },
      });
      expect(await buscarHostnameCustomAtivo(cenario.organization.id)).toBeNull();
    } finally {
      await cenario.destruir();
    }
  });

  test("A) ACTIVE retorna o hostname exato, sem protocolo/porta/slash", async () => {
    const cenario = await criarCenario();
    try {
      await prisma.organizationDomain.create({
        data: {
          organizationId: cenario.organization.id,
          hostname: "au-active.dominio-teste.test",
          type: "CUSTOM",
          status: "ACTIVE",
          verificationToken: "token-au-active",
        },
      });
      const hostname = await buscarHostnameCustomAtivo(cenario.organization.id);
      expect(hostname).toBe("au-active.dominio-teste.test");
      expect(hostname).not.toMatch(/^https?:\/\//);
      expect(hostname).not.toMatch(/\/$/);
    } finally {
      await cenario.destruir();
    }
  });

  test("B) organização sem nenhum domínio cadastrado retorna null (fallback global intacto)", async () => {
    const cenario = await criarCenario();
    try {
      expect(await buscarHostnameCustomAtivo(cenario.organization.id)).toBeNull();
    } finally {
      await cenario.destruir();
    }
  });

  test("EASYMOB_SUBDOMAIN ACTIVE não conta como canonical de domínio próprio (só CUSTOM)", async () => {
    const cenario = await criarCenario();
    try {
      await prisma.organizationDomain.create({
        data: {
          organizationId: cenario.organization.id,
          hostname: "au-subdominio.easymob-teste.com.br",
          type: "EASYMOB_SUBDOMAIN",
          status: "ACTIVE",
          verificationToken: "token-au-subdominio",
        },
      });
      expect(await buscarHostnameCustomAtivo(cenario.organization.id)).toBeNull();
    } finally {
      await cenario.destruir();
    }
  });
});

describe("Correção AU — resolverOrigemPublicacao", () => {
  test("host reservado/canônico resolve como 'global'", async () => {
    expect(await resolverOrigemPublicacao("localhost:3000")).toEqual({ tipo: "global" });
  });

  test("host ausente ou inválido resolve como 'desconhecido'", async () => {
    expect(await resolverOrigemPublicacao(null)).toEqual({ tipo: "desconhecido" });
    expect(await resolverOrigemPublicacao("https://protocolo-invalido.test")).toEqual({ tipo: "desconhecido" });
  });

  test("host de domínio ACTIVE resolve como 'custom' com a organização certa", async () => {
    const cenario = await criarCenario();
    try {
      await prisma.organizationDomain.create({
        data: {
          organizationId: cenario.organization.id,
          hostname: "au-origem.dominio-teste.test",
          type: "CUSTOM",
          status: "ACTIVE",
          verificationToken: "token-au-origem",
        },
      });
      const origem = await resolverOrigemPublicacao("au-origem.dominio-teste.test");
      expect(origem).toEqual({
        tipo: "custom",
        hostname: "au-origem.dominio-teste.test",
        organizationId: cenario.organization.id,
      });
    } finally {
      await cenario.destruir();
    }
  });

  test("host de domínio PENDING resolve como 'desconhecido' (nunca 'custom')", async () => {
    const cenario = await criarCenario();
    try {
      await prisma.organizationDomain.create({
        data: {
          organizationId: cenario.organization.id,
          hostname: "au-origem-pendente.dominio-teste.test",
          type: "CUSTOM",
          status: "PENDING",
          verificationToken: "token-au-origem-pendente",
        },
      });
      expect(await resolverOrigemPublicacao("au-origem-pendente.dominio-teste.test")).toEqual({
        tipo: "desconhecido",
      });
    } finally {
      await cenario.destruir();
    }
  });

  test("host desconhecido nunca é confundido com 'global' (nunca vaza o sitemap da plataforma)", async () => {
    const origem = await resolverOrigemPublicacao("www.host-nunca-visto-antes.test");
    expect(origem.tipo).toBe("desconhecido");
  });
});

describe("Correção AU — sitemap: isolamento de tenant e exclusão de duplicata", () => {
  test("G/H) organização com domínio ACTIVE some do sitemap global (evita duplicata) e o próprio sitemap.ts do domínio custom só lista ela mesma", async () => {
    const cenarioA = await criarCenario({ modulos: ["core", "properties", "custom-domain"] });
    const cenarioB = await criarCenario();
    try {
      await prisma.organizationDomain.create({
        data: {
          organizationId: cenarioA.organization.id,
          hostname: "au-sitemap-a.dominio-teste.test",
          type: "CUSTOM",
          status: "ACTIVE",
          verificationToken: "token-au-sitemap-a",
        },
      });

      // Mesma query usada pelo branch "global" de src/app/sitemap.ts —
      // A tem domínio ACTIVE, deve estar EXCLUÍDA; B nunca teve domínio,
      // deve continuar aparecendo normalmente.
      const organizacoesNoSitemapGlobal = await prisma.organization.findMany({
        where: { active: true, domains: { none: { type: "CUSTOM", status: "ACTIVE" } } },
        select: { id: true },
      });
      const idsNoGlobal = organizacoesNoSitemapGlobal.map((o) => o.id);
      expect(idsNoGlobal).not.toContain(cenarioA.organization.id);
      expect(idsNoGlobal).toContain(cenarioB.organization.id);

      // E o resolvedor usado pelo branch "custom" aponta só pra A.
      const origem = await resolverOrigemPublicacao("au-sitemap-a.dominio-teste.test");
      expect(origem).toMatchObject({ tipo: "custom", organizationId: cenarioA.organization.id });
    } finally {
      await cenarioA.destruir();
      await cenarioB.destruir();
    }
  });
});
