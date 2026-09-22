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
import { canaisDoLocal, horarioDoTopo, horarioDoLocal } from "@/lib/contatos-publicos";
import { estiloDaBarraTopo } from "@/lib/branding/cor-barra-topo";

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
    expect(config.horario).toEqual({
      valor: "Segunda a sexta, das 9h às 18h",
      topo: true,
      // Fase 58.3 — o rodapé entrou no par e nasce desligado.
      rodape: false,
    });
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
    expect(config.horario).toEqual({ valor: "", topo: false, rodape: false });
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

// =======================================================================
// Fase 58.3 — o salvamento é TUDO-OU-NADA
// =======================================================================
// Documentado como teste porque é o modo de falha mais provável por trás
// de "configurei e não apareceu": um único campo inválido, em qualquer
// ponto deste formulário longo, descarta o salvamento inteiro — inclusive
// campos que estavam perfeitamente válidos.

describe("salvamento tudo-ou-nada", () => {
  test("um campo inválido descarta TAMBÉM o horário válido", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    const r = await salvar(
      formulario({
        horarioAtendimento: "Segunda a sexta, das 9h às 18h",
        horarioAtendimentoTopo: "on",
        // Endereço sem esquema: recusado desde a Fase 58.
        instagram: "instagram.com/sem-esquema",
      })
    );
    expect(r.success).toBe(false);

    const settings = await prisma.organizationSettings.findFirst({
      where: { organizationId: c.organization.id },
    });
    // O horário era válido e mesmo assim não foi gravado.
    expect(settings?.businessHours ?? null).toBeNull();
    expect(settings?.businessHoursShowHeader ?? false).toBe(false);
  });

  test("payload completo e válido, como o de um tenant real, grava tudo", async () => {
    const c = await novoCenario();
    autenticarComo(c);

    const r = await salvar(
      formulario({
        telefone: "(11) 3888-3000",
        telefoneTopo: "on",
        whatsapp: "5511999998888",
        whatsappTopo: "on",
        instagram: "https://instagram.com/x",
        instagramTopo: "on",
        facebook: "https://facebook.com/x",
        facebookTopo: "on",
        linkedin: "https://linkedin.com/company/x",
        linkedinTopo: "on",
        youtube: "https://youtube.com/@x",
        youtubeTopo: "on",
        tiktok: "https://tiktok.com/@x",
        tiktokTopo: "on",
        horarioAtendimento: "Segunda a sexta, das 9h às 18h",
        horarioAtendimentoTopo: "on",
      })
    );
    expect(r.success).toBe(true);

    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(horarioDoTopo(config.horario)).toBe("Segunda a sexta, das 9h às 18h");
    expect(canaisDoLocal(config.canais, "topo")).toHaveLength(7);
  });
});

// =======================================================================
// Fase 58.3 — horário no rodapé, e as quatro combinações persistidas
// =======================================================================

describe("horário: topo e rodapé independentes", () => {
  const TEXTO = "Segunda a sexta, das 9h às 18h";

  async function salvarHorario(c: Cenario, topo: boolean, rodape: boolean) {
    autenticarComo(c);
    const campos: Record<string, string> = { horarioAtendimento: TEXTO };
    if (topo) campos.horarioAtendimentoTopo = "on";
    if (rodape) campos.horarioAtendimentoRodape = "on";
    const r = await salvar(formulario(campos));
    expect(r.success).toBe(true);
    return buscarConfiguracaoContato(c.organization.id);
  }

  test("topo sim / rodapé não", async () => {
    const config = await salvarHorario(await novoCenario(), true, false);
    expect(horarioDoLocal(config.horario, "topo")).toBe(TEXTO);
    expect(horarioDoLocal(config.horario, "rodape")).toBeNull();
  });

  test("topo não / rodapé sim", async () => {
    const config = await salvarHorario(await novoCenario(), false, true);
    expect(horarioDoLocal(config.horario, "topo")).toBeNull();
    expect(horarioDoLocal(config.horario, "rodape")).toBe(TEXTO);
  });

  test("ambos", async () => {
    const config = await salvarHorario(await novoCenario(), true, true);
    expect(horarioDoLocal(config.horario, "topo")).toBe(TEXTO);
    expect(horarioDoLocal(config.horario, "rodape")).toBe(TEXTO);
  });

  test("nenhum: guardado e invisível", async () => {
    const config = await salvarHorario(await novoCenario(), false, false);
    expect(config.horario.valor).toBe(TEXTO);
    expect(horarioDoLocal(config.horario, "topo")).toBeNull();
    expect(horarioDoLocal(config.horario, "rodape")).toBeNull();
  });

  test("texto vazio com as duas flags não aparece em lugar nenhum", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    await salvar(
      formulario({ horarioAtendimentoTopo: "on", horarioAtendimentoRodape: "on" })
    );
    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(horarioDoLocal(config.horario, "topo")).toBeNull();
    expect(horarioDoLocal(config.horario, "rodape")).toBeNull();
  });

  test("desmarcar só o Topo mantém o rodapé — e vice-versa", async () => {
    const c = await novoCenario();
    await salvarHorario(c, true, true);

    // Tira o topo.
    await salvar(
      formulario({ horarioAtendimento: TEXTO, horarioAtendimentoRodape: "on" })
    );
    let config = await buscarConfiguracaoContato(c.organization.id);
    expect(horarioDoLocal(config.horario, "topo")).toBeNull();
    expect(horarioDoLocal(config.horario, "rodape")).toBe(TEXTO);

    // Tira o rodapé, devolve o topo.
    await salvar(formulario({ horarioAtendimento: TEXTO, horarioAtendimentoTopo: "on" }));
    config = await buscarConfiguracaoContato(c.organization.id);
    expect(horarioDoLocal(config.horario, "topo")).toBe(TEXTO);
    expect(horarioDoLocal(config.horario, "rodape")).toBeNull();
  });

  test("o rodapé nasce desligado para quem já tinha horário no topo", async () => {
    const c = await novoCenario();
    // Estado de um tenant da Fase 58.2: horário no topo, coluna nova
    // ainda no default.
    await prisma.organizationSettings.create({
      data: {
        organizationId: c.organization.id,
        businessHours: TEXTO,
        businessHoursShowHeader: true,
      },
    });
    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(horarioDoLocal(config.horario, "topo")).toBe(TEXTO);
    expect(horarioDoLocal(config.horario, "rodape")).toBeNull();
  });

  test("o horário de uma organização não vaza para o rodapé de outra", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    await salvarHorario(b, true, true);

    const configA = await buscarConfiguracaoContato(a.organization.id);
    expect(horarioDoLocal(configA.horario, "topo")).toBeNull();
    expect(horarioDoLocal(configA.horario, "rodape")).toBeNull();
  });

  test("BROKER não altera o horário do rodapé", async () => {
    const c = await novoCenario();
    await prisma.organizationMember.update({
      where: { id: c.membro.id, organizationId: c.organization.id },
      data: { role: "BROKER" },
    });
    autenticarComo(c, "BROKER");
    const r = await salvar(
      formulario({ horarioAtendimento: TEXTO, horarioAtendimentoRodape: "on" })
    );
    expect(r.success).toBe(false);
  });
});

// =======================================================================
// Fase 58.5 — cor de fundo da barra superior
// =======================================================================

describe("cor de fundo da barra superior", () => {
  test("tenant que nunca configurou fica sem personalização", async () => {
    const c = await novoCenario();
    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(config.corBarraTopo).toBeNull();
    // null => a barra mantém o visual de sempre.
    expect(estiloDaBarraTopo(config.corBarraTopo)).toBeNull();
  });

  test("persiste a cor escolhida, normalizada", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    const r = await salvar(formulario({ corBarraTopo: "#F5F5F5" }));
    expect(r.success).toBe(true);

    const settings = await prisma.organizationSettings.findFirstOrThrow({
      where: { organizationId: c.organization.id },
    });
    expect(settings.topBarBackgroundColor).toBe("#f5f5f5");

    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(estiloDaBarraTopo(config.corBarraTopo)?.fundo).toBe("#f5f5f5");
  });

  test("campo vazio remove a personalização — volta a null, não ao hex do padrão", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    await salvar(formulario({ corBarraTopo: "#0f172a" }));
    await salvar(formulario({ corBarraTopo: "" }));

    const settings = await prisma.organizationSettings.findFirstOrThrow({
      where: { organizationId: c.organization.id },
    });
    expect(settings.topBarBackgroundColor).toBeNull();
    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(estiloDaBarraTopo(config.corBarraTopo)).toBeNull();
  });

  const invalidos = [
    "#fff",
    "white",
    "rgb(0,0,0)",
    "url(https://exemplo.test/x.png)",
    "var(--primary)",
    "linear-gradient(red, blue)",
    "red; position: fixed",
    "#ffffff; background-image: url(x)",
  ];
  for (const valor of invalidos) {
    test(`recusa ${valor.slice(0, 28)} e não grava nada`, async () => {
      const c = await novoCenario();
      autenticarComo(c);
      const r = await salvar(formulario({ corBarraTopo: valor }));
      expect(r.success).toBe(false);

      const settings = await prisma.organizationSettings.findFirst({
        where: { organizationId: c.organization.id },
      });
      expect(settings?.topBarBackgroundColor ?? null).toBeNull();
    });
  }

  test("BROKER não altera a cor", async () => {
    const c = await novoCenario();
    await prisma.organizationMember.update({
      where: { id: c.membro.id, organizationId: c.organization.id },
      data: { role: "BROKER" },
    });
    autenticarComo(c, "BROKER");
    const r = await salvar(formulario({ corBarraTopo: "#0f172a" }));
    expect(r.success).toBe(false);
  });

  test("a cor de uma organização não aparece na outra", async () => {
    const a = await novoCenario();
    const b = await novoCenario();
    autenticarComo(b);
    await salvar(formulario({ corBarraTopo: "#0f172a" }));

    const configA = await buscarConfiguracaoContato(a.organization.id);
    expect(configA.corBarraTopo).toBeNull();
    expect(estiloDaBarraTopo(configA.corBarraTopo)).toBeNull();

    const configB = await buscarConfiguracaoContato(b.organization.id);
    expect(estiloDaBarraTopo(configB.corBarraTopo)?.fundo).toBe("#0f172a");
  });

  test("gravar a cor não mexe em canais nem horário", async () => {
    const c = await novoCenario();
    autenticarComo(c);
    await salvar(
      formulario({
        telefone: "(11) 3888-3000",
        telefoneTopo: "on",
        horarioAtendimento: "Seg a Sex",
        horarioAtendimentoTopo: "on",
        corBarraTopo: "#0f172a",
      })
    );

    const config = await buscarConfiguracaoContato(c.organization.id);
    expect(canaisDoLocal(config.canais, "topo").map((x) => x.chave)).toEqual(["telefone"]);
    expect(horarioDoLocal(config.horario, "topo")).toBe("Seg a Sex");
    expect(estiloDaBarraTopo(config.corBarraTopo)?.fundo).toBe("#0f172a");
  });
});
