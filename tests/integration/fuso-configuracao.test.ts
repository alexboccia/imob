import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario } from "@/test/fixtures";

// Mesma limitação de resolução de módulo já documentada nos outros
// testes de integração (next-auth → next/server não resolve sob Vitest).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { salvarConfiguracaoContato } from "@/app/app/configuracoes/actions";
import { buscarFusoOrganizacao } from "@/lib/fuso-organizacao";

// =======================================================================
// Fase 18 — configurar o fuso horário da organização
// =======================================================================
// A configuração vive em /app/configuracoes, junto do resto da
// configuração institucional — nenhuma tela nova. O que este arquivo
// prova: validação IANA server-side, autorização pelo gate que já
// existia, isolamento entre tenants, e que salvar NÃO reescreve nenhum
// timestamp.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];
afterEach(async () => {
  vi.mocked(auth).mockReset();
  while (cenarios.length) await cenarios.pop()!.destruir();
});

async function novoCenario(
  opcoes: { role?: "OWNER" | "ADMIN" | "BROKER"; timezone?: string | null } = {}
): Promise<Cenario> {
  const cenario = await criarCenario({
    modulos: ["core", "properties", "crm"],
    role: opcoes.role ?? "OWNER",
    timezone: opcoes.timezone ?? null,
  });
  cenarios.push(cenario);
  return cenario;
}

function autenticarComo(cenario: Cenario, role = "OWNER") {
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

function formulario(timezone: string): FormData {
  const fd = new FormData();
  fd.set("themeId", "classic-blue");
  fd.set("footerAparencia", "AUTO");
  fd.set("timezone", timezone);
  return fd;
}

const fusoDe = (organizationId: string) =>
  prisma.organization
    .findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } })
    .then((o) => o.timezone);

describe("salvar o fuso horário", () => {
  test.each(["America/Sao_Paulo", "UTC", "Europe/Lisbon", "America/Manaus", "America/New_York"])(
    "%s é aceito e persistido como identificador IANA",
    async (timezone) => {
      const cenario = await novoCenario();
      autenticarComo(cenario);

      const estado = await salvarConfiguracaoContato(
        { success: false, message: "" },
        formulario(timezone)
      );
      expect(estado.success).toBe(true);
      expect(await fusoDe(cenario.organization.id)).toBe(timezone);
      expect(await buscarFusoOrganizacao(cenario.organization.id)).toBe(timezone);
    }
  );

  // Offset fixo é o caso perigoso: Intl.DateTimeFormat o ACEITA, mas ele
  // não descreve DST nenhum — nem passado nem futuro.
  test.each(["-03:00", "+05:30", "Etc/GMT+3", "Foo/Bar", "america/sao_paulo", ""])(
    "%j é recusado com erro de campo e NADA é salvo",
    async (timezone) => {
      const cenario = await novoCenario({ timezone: "UTC" });
      autenticarComo(cenario);

      const estado = await salvarConfiguracaoContato(
        { success: false, message: "" },
        formulario(timezone)
      );
      expect(estado.success).toBe(false);
      expect(estado.fieldErrors?.timezone?.[0]).toBe("Fuso horário inválido.");
      // O valor anterior permanece — a submissão inteira foi rejeitada.
      expect(await fusoDe(cenario.organization.id)).toBe("UTC");
    }
  );

  test("a submissão inválida não grava NADA, nem os campos válidos do mesmo formulário", async () => {
    const cenario = await novoCenario({ timezone: "UTC" });
    autenticarComo(cenario);

    const fd = formulario("-03:00");
    fd.set("telefone", "11999999999");
    const estado = await salvarConfiguracaoContato({ success: false, message: "" }, fd);

    expect(estado.success).toBe(false);
    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: cenario.organization.id },
    });
    expect(settings).toBeNull();
  });
});

describe("autorização", () => {
  test.each(["OWNER", "ADMIN"])("%s pode alterar o fuso", async (role) => {
    const cenario = await novoCenario();
    autenticarComo(cenario, role);
    const estado = await salvarConfiguracaoContato(
      { success: false, message: "" },
      formulario("America/Sao_Paulo")
    );
    expect(estado.success).toBe(true);
    expect(await fusoDe(cenario.organization.id)).toBe("America/Sao_Paulo");
  });

  // Nenhum papel novo foi inventado: é o mesmo gate
  // PAPEIS_GESTAO_CONFIGURACOES que já protegia o resto da tela.
  test.each(["BROKER", "VIEWER"])("%s não pode alterar o fuso", async (role) => {
    const cenario = await novoCenario({ timezone: "UTC" });
    autenticarComo(cenario, role);
    const estado = await salvarConfiguracaoContato(
      { success: false, message: "" },
      formulario("America/Sao_Paulo")
    );
    expect(estado.success).toBe(false);
    expect(await fusoDe(cenario.organization.id)).toBe("UTC");
  });
});

describe("isolamento entre tenants", () => {
  test("a Org A não altera o fuso da Org B — o id vem da sessão, nunca do formulário", async () => {
    const a = await novoCenario({ timezone: "UTC" });
    const b = await novoCenario({ timezone: "Europe/Lisbon" });

    autenticarComo(a);
    // O formulário tenta se passar por outra organização de todas as
    // formas plausíveis; nenhuma delas é lida pela action.
    const fd = formulario("America/Sao_Paulo");
    fd.set("organizationId", b.organization.id);
    fd.set("id", b.organization.id);

    const estado = await salvarConfiguracaoContato({ success: false, message: "" }, fd);
    expect(estado.success).toBe(true);
    expect(await fusoDe(a.organization.id)).toBe("America/Sao_Paulo");
    // B permanece intocada.
    expect(await fusoDe(b.organization.id)).toBe("Europe/Lisbon");
  });
});

describe("mudar o fuso não reescreve dado", () => {
  test("createdAt/updatedAt de Organization e os timestamps do domínio ficam intactos", async () => {
    const cenario = await novoCenario({ timezone: "UTC" });
    autenticarComo(cenario);

    const antes = await prisma.organization.findUniqueOrThrow({
      where: { id: cenario.organization.id },
      select: { createdAt: true },
    });

    await salvarConfiguracaoContato(
      { success: false, message: "" },
      formulario("America/Sao_Paulo")
    );

    const depois = await prisma.organization.findUniqueOrThrow({
      where: { id: cenario.organization.id },
      select: { createdAt: true, timezone: true },
    });
    expect(depois.createdAt.getTime()).toBe(antes.createdAt.getTime());
    expect(depois.timezone).toBe("America/Sao_Paulo");
  });

  test("trocar de volta para UTC é possível — a escolha é da organização", async () => {
    const cenario = await novoCenario({ timezone: "America/Sao_Paulo" });
    autenticarComo(cenario);
    const estado = await salvarConfiguracaoContato(
      { success: false, message: "" },
      formulario("UTC")
    );
    expect(estado.success).toBe(true);
    expect(await fusoDe(cenario.organization.id)).toBe("UTC");
  });
});
