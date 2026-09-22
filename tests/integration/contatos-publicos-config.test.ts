import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario } from "@/test/fixtures";

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
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { canaisDoLocal, horarioDoTopo } from "@/lib/contatos-publicos";

// =======================================================================
// Contatos e redes sociais configuráveis (Fase 58) — contra o banco
// =======================================================================
// O que se protege aqui: as flags persistem, o valor continua único para
// os dois locais, URL perigosa não entra, e a autorização institucional
// não afrouxou.

type Cenario = Awaited<ReturnType<typeof criarCenario>>;
const cenarios: Cenario[] = [];

afterEach(async () => {
  while (cenarios.length) await cenarios.pop()!.destruir();
  vi.mocked(auth).mockReset();
});

async function novoCenario() {
  const c = await criarCenario();
  cenarios.push(c);
  return c;
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

function formulario(campos: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("themeId", "classic-blue");
  fd.set("footerAparencia", "AUTO");
  fd.set("timezone", "America/Sao_Paulo");
  fd.set("visibilidadeComercial", "COLLABORATIVE");
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

const salvar = (fd: FormData) =>
  salvarConfiguracaoContato({ success: false, message: "" }, fd);

describe("persistência das flags", () => {
  test("marcar topo e rodapé grava os dois, e o valor é um só", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    const r = await salvar(
      formulario({
        instagram: "https://instagram.com/exemplo",
        instagramTopo: "on",
        instagramRodape: "on",
      })
    );
    expect(r.success).toBe(true);

    const settings = await prisma.organizationSettings.findFirstOrThrow({
      where: { organizationId: c.organization.id },
    });
    expect(settings.instagram).toBe("https://instagram.com/exemplo");
    expect(settings.instagramShowHeader).toBe(true);
    expect(settings.instagramShowFooter).toBe(true);
  });

  test("desmarcar de fato desliga — checkbox ausente não mantém o valor antigo", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    await salvar(
      formulario({
        instagram: "https://instagram.com/exemplo",
        instagramTopo: "on",
        instagramRodape: "on",
      })
    );
    // Segundo salvamento SEM os checkboxes: é assim que o navegador
    // envia um formulário com as caixas desmarcadas.
    await salvar(formulario({ instagram: "https://instagram.com/exemplo" }));

    const settings = await prisma.organizationSettings.findFirstOrThrow({
      where: { organizationId: c.organization.id },
    });
    expect(settings.instagramShowHeader).toBe(false);
    expect(settings.instagramShowFooter).toBe(false);
  });

  test("a configuração sobrevive à releitura, canal a canal", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    await salvar(
      formulario({
        telefone: "(11) 3888-3000",
        telefoneTopo: "on",
        whatsapp: "5511999998888",
        whatsappRodape: "on",
        tiktok: "https://tiktok.com/@exemplo",
        tiktokTopo: "on",
      })
    );

    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(config.canais.telefone).toEqual({ valor: "(11) 3888-3000", topo: true, rodape: false });
    expect(config.canais.whatsapp).toEqual({ valor: "5511999998888", topo: false, rodape: true });
    expect(config.canais.tiktok.valor).toBe("https://tiktok.com/@exemplo");
    expect(config.canais.tiktok.topo).toBe(true);

    // E o que o site renderiza segue a mesma configuração.
    expect(canaisDoLocal(config.canais, "topo").map((x) => x.chave)).toEqual([
      "telefone",
      "tiktok",
    ]);
    expect(canaisDoLocal(config.canais, "rodape").map((x) => x.chave)).toEqual(["whatsapp"]);
  });

  test("valor salvo com as duas flags desligadas fica guardado, mas invisível", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    await salvar(formulario({ facebook: "https://facebook.com/exemplo" }));

    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(config.canais.facebook.valor).toBe("https://facebook.com/exemplo");
    expect(canaisDoLocal(config.canais, "topo")).toHaveLength(0);
    expect(canaisDoLocal(config.canais, "rodape")).toHaveLength(0);
  });
});

describe("tenant que nunca configurou nada", () => {
  test("não tem barra no topo e não ganha bloco de contato no rodapé", async () => {
    const c = await novoCenario();
    const config = await buscarConfiguracaoContato(c.organization.id);

    expect(canaisDoLocal(config.canais, "topo")).toHaveLength(0);
    expect(canaisDoLocal(config.canais, "rodape")).toHaveLength(0);
  });

  test("as redes já preenchidas continuam no rodapé, como antes da fase", async () => {
    const c = await novoCenario();
    // Simula o estado de um tenant ANTIGO: URL gravada, nenhuma flag
    // tocada (os defaults do schema entram em cena).
    await prisma.organizationSettings.create({
      data: {
        organizationId: c.organization.id,
        instagram: "https://instagram.com/antigo",
      },
    });

    const config = await buscarConfiguracaoContato(c.organization.id);
    // Sem regressão visual: o ícone que já aparecia continua aparecendo.
    expect(canaisDoLocal(config.canais, "rodape").map((x) => x.chave)).toEqual(["instagram"]);
    // E nada de novo no topo.
    expect(canaisDoLocal(config.canais, "topo")).toHaveLength(0);
  });

  test("telefone antigo NÃO passa a aparecer no rodapé por causa da fase", async () => {
    const c = await novoCenario();
    await prisma.organizationSettings.create({
      data: { organizationId: c.organization.id, phone: "(11) 3888-3000" },
    });

    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(canaisDoLocal(config.canais, "rodape")).toHaveLength(0);
    expect(canaisDoLocal(config.canais, "topo")).toHaveLength(0);
  });
});

describe("validação de URL no servidor", () => {
  for (const perigoso of ["javascript:alert(1)", "data:text/html,<script>", "vbscript:x"]) {
    test(`recusa ${perigoso.slice(0, 20)} e não grava nada`, async () => {
      const c = await novoCenario();
      autenticarComo(c);

      const r = await salvar(formulario({ instagram: perigoso, instagramRodape: "on" }));
      expect(r.success).toBe(false);

      const settings = await prisma.organizationSettings.findFirst({
        where: { organizationId: c.organization.id },
      });
      expect(settings?.instagram ?? null).toBeNull();
    });
  }

  test("endereço sem esquema é recusado com mensagem útil", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    const r = await salvar(formulario({ facebook: "facebook.com/exemplo" }));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.fieldErrors)).toContain("https://");
  });

  test("https válido passa", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    const r = await salvar(formulario({ youtube: "https://youtube.com/@exemplo" }));
    expect(r.success).toBe(true);
  });
});

describe("autorização e isolamento", () => {
  for (const papel of ["BROKER", "MANAGER", "ASSISTANT"]) {
    test(`${papel} não altera contatos institucionais`, async () => {
      const c = await novoCenario();
      // O papel que vale é o do VÍNCULO no banco, não o do token
      // (papelAtual, Fase 27) — por isso o membro é rebaixado de
      // verdade, e não só o mock da sessão.
      await prisma.organizationMember.update({
        where: { id: c.membro.id, organizationId: c.organization.id },
        data: { role: papel as "BROKER" },
      });
      autenticarComo(c, papel);

      const r = await salvar(
        formulario({ instagram: "https://instagram.com/invasor", instagramTopo: "on" })
      );
      expect(r.success).toBe(false);

      const settings = await prisma.organizationSettings.findFirst({
        where: { organizationId: c.organization.id },
      });
      expect(settings?.instagram ?? null).toBeNull();
    });
  }

  test("ADMIN altera, como já podia", async () => {
    const c = await novoCenario();
    await prisma.organizationMember.update({
      where: { id: c.membro.id, organizationId: c.organization.id },
      data: { role: "ADMIN" },
    });
    autenticarComo(c, "ADMIN");
    expect((await salvar(formulario({ instagram: "https://instagram.com/ok" }))).success).toBe(true);
  });

  test("salvar numa organização não toca na configuração de outra", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    autenticarComo(b);
    await salvar(
      formulario({ instagram: "https://instagram.com/da-b", instagramTopo: "on" })
    );

    const configA = await buscarConfiguracaoContato(a.organization.id);
    expect(configA.canais.instagram.valor).toBe("");
    expect(canaisDoLocal(configA.canais, "topo")).toHaveLength(0);

    const configB = await buscarConfiguracaoContato(b.organization.id);
    expect(configB.canais.instagram.valor).toBe("https://instagram.com/da-b");
  });
});

describe("horário de atendimento (Fase 58.2)", () => {
  test("persiste valor e flag, e o site resolve o texto", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    const r = await salvar(
      formulario({
        horarioAtendimento: "Segunda a sexta, das 9h às 18h",
        horarioAtendimentoTopo: "on",
      })
    );
    expect(r.success).toBe(true);

    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(config.horario).toEqual({ valor: "Segunda a sexta, das 9h às 18h", topo: true });
    expect(horarioDoTopo(config.horario)).toBe("Segunda a sexta, das 9h às 18h");
  });

  test("salvo sem marcar Topo fica guardado, mas não aparece", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    await salvar(formulario({ horarioAtendimento: "Seg a Sex, 9h às 18h" }));

    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(config.horario.valor).toBe("Seg a Sex, 9h às 18h");
    expect(config.horario.topo).toBe(false);
    expect(horarioDoTopo(config.horario)).toBeNull();
  });

  test("desmarcar Topo depois desliga de fato", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    await salvar(
      formulario({ horarioAtendimento: "Seg a Sex", horarioAtendimentoTopo: "on" })
    );
    await salvar(formulario({ horarioAtendimento: "Seg a Sex" }));

    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(config.horario.topo).toBe(false);
  });

  test("espaços são aparados na gravação; só espaços vira null", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    await salvar(formulario({ horarioAtendimento: "   Seg  a   Sex   " }));
    let settings = await prisma.organizationSettings.findFirstOrThrow({
      where: { organizationId: c.organization.id },
    });
    expect(settings.businessHours).toBe("Seg a Sex");

    await salvar(formulario({ horarioAtendimento: "    " }));
    settings = await prisma.organizationSettings.findFirstOrThrow({
      where: { organizationId: c.organization.id },
    });
    expect(settings.businessHours).toBeNull();
  });

  test("texto longo demais é recusado e nada é gravado", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    const r = await salvar(formulario({ horarioAtendimento: "a".repeat(200) }));
    expect(r.success).toBe(false);
    const settings = await prisma.organizationSettings.findFirst({
      where: { organizationId: c.organization.id },
    });
    expect(settings?.businessHours ?? null).toBeNull();
  });

  test("marcação é recusada — nada de HTML guardado", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    for (const perigoso of ["<b>9h</b>", "<script>alert(1)</script>", "9h <img src=x>"]) {
      const r = await salvar(formulario({ horarioAtendimento: perigoso }));
      expect(r.success).toBe(false);
    }
    const settings = await prisma.organizationSettings.findFirst({
      where: { organizationId: c.organization.id },
    });
    expect(settings?.businessHours ?? null).toBeNull();
  });

  test("tenant que nunca configurou não tem horário no topo", async () => {
    const c = await novoCenario();
    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(config.horario).toEqual({ valor: "", topo: false });
    expect(horarioDoTopo(config.horario)).toBeNull();
  });

  test("BROKER não altera o horário", async () => {
    const c = await novoCenario();
    await prisma.organizationMember.update({
      where: { id: c.membro.id, organizationId: c.organization.id },
      data: { role: "BROKER" },
    });
    autenticarComo(c, "BROKER");

    const r = await salvar(
      formulario({ horarioAtendimento: "Seg a Sex", horarioAtendimentoTopo: "on" })
    );
    expect(r.success).toBe(false);
    const settings = await prisma.organizationSettings.findFirst({
      where: { organizationId: c.organization.id },
    });
    expect(settings?.businessHours ?? null).toBeNull();
  });

  test("o horário de uma organização não vaza para outra", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    autenticarComo(b);
    await salvar(
      formulario({ horarioAtendimento: "Horário da B", horarioAtendimentoTopo: "on" })
    );

    const configA = await buscarConfiguracaoContato(a.organization.id);
    expect(configA.horario.valor).toBe("");
    expect(horarioDoTopo(configA.horario)).toBeNull();

    const configB = await buscarConfiguracaoContato(b.organization.id);
    expect(configB.horario.valor).toBe("Horário da B");
  });

  test("gravar o horário não mexe nas flags dos canais", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    await salvar(
      formulario({
        instagram: "https://instagram.com/exemplo",
        instagramTopo: "on",
        instagramRodape: "on",
        horarioAtendimento: "Seg a Sex",
        horarioAtendimentoTopo: "on",
      })
    );

    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(config.canais.instagram.topo).toBe(true);
    expect(config.canais.instagram.rodape).toBe(true);
    expect(canaisDoLocal(config.canais, "topo").map((x) => x.chave)).toEqual(["instagram"]);
    expect(canaisDoLocal(config.canais, "rodape").map((x) => x.chave)).toEqual(["instagram"]);
  });
});
