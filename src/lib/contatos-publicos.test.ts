import { describe, test, expect } from "vitest";
import {
  CANAIS_PUBLICOS,
  canaisDoLocal,
  temCanais,
  urlRedeSocialValida,
  normalizarUrlRedeSocial,
  horarioDoTopo,
  horarioDoLocal,
  normalizarHorario,
  horarioTemMarcacao,
  separadoresDaBarra,
  LIMITE_HORARIO_ATENDIMENTO,
  type ChaveCanal,
  type ConfiguracaoCanais,
} from "@/lib/contatos-publicos";

// =======================================================================
// Contatos institucionais do site público (Fase 58)
// =======================================================================
// A regra que estes testes protegem é uma só, e vale para todo canal:
//
//     aparece  <=>  valor preenchido  E  flag do local ligada
//
// Ela é o que garante que nenhuma informação vazia produza elemento
// visual — nem ícone sem link, nem separador órfão, nem barra vazia.

const VAZIO: ConfiguracaoCanais = {
  telefone: { valor: "", topo: false, rodape: false },
  whatsapp: { valor: "", topo: false, rodape: false },
  instagram: { valor: "", topo: false, rodape: false },
  facebook: { valor: "", topo: false, rodape: false },
  linkedin: { valor: "", topo: false, rodape: false },
  youtube: { valor: "", topo: false, rodape: false },
  tiktok: { valor: "", topo: false, rodape: false },
};

/** Valor plausível para cada canal, usado pelas varreduras abaixo. */
const VALOR: Record<ChaveCanal, string> = {
  telefone: "(11) 3888-3000",
  whatsapp: "5511999998888",
  instagram: "https://instagram.com/exemplo",
  facebook: "https://facebook.com/exemplo",
  linkedin: "https://linkedin.com/company/exemplo",
  youtube: "https://youtube.com/@exemplo",
  tiktok: "https://tiktok.com/@exemplo",
};

function com(chave: ChaveCanal, config: Partial<ConfiguracaoCanais[ChaveCanal]>): ConfiguracaoCanais {
  return { ...VAZIO, [chave]: { ...VAZIO[chave], ...config } };
}

describe("a regra vale para TODOS os canais, um por um", () => {
  for (const { chave } of CANAIS_PUBLICOS) {
    describe(chave, () => {
      test("preenchido + topo ligado -> aparece no topo", () => {
        const c = com(chave, { valor: VALOR[chave], topo: true });
        expect(canaisDoLocal(c, "topo").map((x) => x.chave)).toEqual([chave]);
      });

      test("preenchido + topo desligado -> NÃO aparece no topo", () => {
        const c = com(chave, { valor: VALOR[chave], topo: false });
        expect(canaisDoLocal(c, "topo")).toHaveLength(0);
      });

      test("preenchido + rodapé ligado -> aparece no rodapé", () => {
        const c = com(chave, { valor: VALOR[chave], rodape: true });
        expect(canaisDoLocal(c, "rodape").map((x) => x.chave)).toEqual([chave]);
      });

      test("preenchido + rodapé desligado -> NÃO aparece no rodapé", () => {
        const c = com(chave, { valor: VALOR[chave], rodape: false });
        expect(canaisDoLocal(c, "rodape")).toHaveLength(0);
      });

      test("VAZIO com as duas flags ligadas -> não aparece em lugar nenhum", () => {
        const c = com(chave, { valor: "", topo: true, rodape: true });
        expect(canaisDoLocal(c, "topo")).toHaveLength(0);
        expect(canaisDoLocal(c, "rodape")).toHaveLength(0);
      });

      test("só espaços em branco também conta como vazio", () => {
        const c = com(chave, { valor: "   ", topo: true, rodape: true });
        expect(canaisDoLocal(c, "topo")).toHaveLength(0);
        expect(canaisDoLocal(c, "rodape")).toHaveLength(0);
      });

      test("preenchido + as duas flags -> aparece nos dois lugares", () => {
        const c = com(chave, { valor: VALOR[chave], topo: true, rodape: true });
        expect(canaisDoLocal(c, "topo").map((x) => x.chave)).toEqual([chave]);
        expect(canaisDoLocal(c, "rodape").map((x) => x.chave)).toEqual([chave]);
      });

      test("preenchido + nenhuma flag -> fica salvo, mas invisível", () => {
        const c = com(chave, { valor: VALOR[chave], topo: false, rodape: false });
        expect(canaisDoLocal(c, "topo")).toHaveLength(0);
        expect(canaisDoLocal(c, "rodape")).toHaveLength(0);
        // O valor não foi apagado — só não é exibido.
        expect(c[chave].valor).toBe(VALOR[chave]);
      });
    });
  }
});

describe("barra e blocos vazios não existem", () => {
  test("configuração inteiramente vazia não produz canal nenhum", () => {
    expect(canaisDoLocal(VAZIO, "topo")).toHaveLength(0);
    expect(canaisDoLocal(VAZIO, "rodape")).toHaveLength(0);
    expect(temCanais(VAZIO, "topo")).toBe(false);
    expect(temCanais(VAZIO, "rodape")).toBe(false);
  });

  test("tudo preenchido mas nada habilitado para o topo -> topo vazio", () => {
    const tudo = Object.fromEntries(
      CANAIS_PUBLICOS.map(({ chave }) => [chave, { valor: VALOR[chave], topo: false, rodape: true }])
    ) as ConfiguracaoCanais;
    expect(temCanais(tudo, "topo")).toBe(false);
    expect(canaisDoLocal(tudo, "rodape")).toHaveLength(CANAIS_PUBLICOS.length);
  });
});

describe("ordem e composição", () => {
  test("a ordem exibida é a do catálogo, não a de preenchimento", () => {
    const tudo = Object.fromEntries(
      CANAIS_PUBLICOS.map(({ chave }) => [chave, { valor: VALOR[chave], topo: true, rodape: true }])
    ) as ConfiguracaoCanais;
    expect(canaisDoLocal(tudo, "topo").map((c) => c.chave)).toEqual(
      CANAIS_PUBLICOS.map((c) => c.chave)
    );
  });

  test("o catálogo cobre exatamente os sete canais combinados", () => {
    expect(CANAIS_PUBLICOS.map((c) => c.chave)).toEqual([
      "telefone",
      "whatsapp",
      "instagram",
      "facebook",
      "linkedin",
      "youtube",
      "tiktok",
    ]);
  });
});

describe("telefone", () => {
  test("href tel: usa só os dígitos; o texto mantém a formatação", () => {
    const c = com("telefone", { valor: "(11) 3888-3000", topo: true });
    const [canal] = canaisDoLocal(c, "topo");
    expect(canal.href).toBe("tel:+1138883000");
    expect(canal.texto).toBe("(11) 3888-3000");
    // Telefone não é link externo: não abre em nova aba.
    expect(canal.externo).toBe(false);
  });

  test("número curto demais não vira link quebrado", () => {
    const c = com("telefone", { valor: "123", topo: true });
    expect(canaisDoLocal(c, "topo")).toHaveLength(0);
  });

  test("texto sem dígito nenhum não vira telefone", () => {
    const c = com("telefone", { valor: "fale conosco", topo: true });
    expect(canaisDoLocal(c, "topo")).toHaveLength(0);
  });
});

describe("WhatsApp", () => {
  test("usa o gerador do projeto e mostra 'WhatsApp', não o número", () => {
    const c = com("whatsapp", { valor: "5511999998888", topo: true });
    const [canal] = canaisDoLocal(c, "topo", { nomeOrganizacao: "Imobiliária Exemplo" });
    expect(canal.href.startsWith("https://wa.me/5511999998888")).toBe(true);
    // No topo o rótulo evita repetir dois números parecidos lado a lado.
    expect(canal.texto).toBe("WhatsApp");
    expect(canal.externo).toBe(true);
  });

  test("a mensagem é a cortesia padrão, com o nome da organização", () => {
    const c = com("whatsapp", { valor: "5511999998888", topo: true });
    const [canal] = canaisDoLocal(c, "topo", { nomeOrganizacao: "Imobiliária Exemplo" });
    expect(decodeURIComponent(canal.href)).toContain("Imobiliária Exemplo");
  });

  test("número incompleto não vira CTA", () => {
    const c = com("whatsapp", { valor: "119", topo: true });
    expect(canaisDoLocal(c, "topo")).toHaveLength(0);
  });
});

describe("redes sociais: links seguros", () => {
  test("http e https passam", () => {
    expect(urlRedeSocialValida("https://instagram.com/x")).toBe(true);
    expect(urlRedeSocialValida("http://instagram.com/x")).toBe(true);
  });

  const perigosos = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)  ",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "javascript:/*--></script><script>alert(1)</script>",
  ];

  for (const valor of perigosos) {
    test(`recusa ${valor.slice(0, 28)}`, () => {
      expect(urlRedeSocialValida(valor)).toBe(false);
      expect(normalizarUrlRedeSocial(valor)).toBeNull();
    });
  }

  test("valor perigoso NUNCA vira href, mesmo já gravado no banco", () => {
    // Estes campos eram string livre antes da Fase 58: um valor assim
    // pode existir em base antiga. A revalidação na leitura é o que
    // impede que ele vire link agora.
    const c = com("instagram", { valor: "javascript:alert(1)", topo: true, rodape: true });
    expect(canaisDoLocal(c, "topo")).toHaveLength(0);
    expect(canaisDoLocal(c, "rodape")).toHaveLength(0);
  });

  test("URL relativa ou sem host é recusada", () => {
    expect(urlRedeSocialValida("/instagram")).toBe(false);
    expect(urlRedeSocialValida("instagram.com/x")).toBe(false);
    expect(urlRedeSocialValida("https://")).toBe(false);
  });

  test("rede válida é externa e carrega o rótulo como nome acessível", () => {
    const c = com("linkedin", { valor: "https://linkedin.com/company/x", rodape: true });
    const [canal] = canaisDoLocal(c, "rodape");
    expect(canal.externo).toBe(true);
    expect(canal.rotulo).toBe("LinkedIn");
    expect(canal.href).toBe("https://linkedin.com/company/x");
  });

  test("normalizar apenas apara espaços de uma URL válida", () => {
    expect(normalizarUrlRedeSocial("  https://instagram.com/x  ")).toBe("https://instagram.com/x");
  });
});

describe("topo e rodapé são independentes", () => {
  test("um canal só no rodapé e outro só no topo não se misturam", () => {
    const c: ConfiguracaoCanais = {
      ...VAZIO,
      telefone: { valor: VALOR.telefone, topo: true, rodape: false },
      linkedin: { valor: VALOR.linkedin, topo: false, rodape: true },
    };
    expect(canaisDoLocal(c, "topo").map((x) => x.chave)).toEqual(["telefone"]);
    expect(canaisDoLocal(c, "rodape").map((x) => x.chave)).toEqual(["linkedin"]);
  });

  test("o valor é o MESMO nos dois locais — nunca duas URLs diferentes", () => {
    const c = com("instagram", { valor: VALOR.instagram, topo: true, rodape: true });
    const topo = canaisDoLocal(c, "topo")[0];
    const rodape = canaisDoLocal(c, "rodape")[0];
    expect(topo.href).toBe(rodape.href);
  });
});

// =======================================================================
// Horário de atendimento (Fase 58.2)
// =======================================================================
// Mesma regra dos canais — preenchido E habilitado — sobre um valor que
// não é link.

describe("horário de atendimento", () => {
  const h = (valor: string, topo: boolean, rodape = false) => ({ valor, topo, rodape });

  test("vazio não aparece, mesmo habilitado nos dois", () => {
    expect(horarioDoLocal(h("", true, true), "topo")).toBeNull();
    expect(horarioDoLocal(h("", true, true), "rodape")).toBeNull();
    expect(horarioDoLocal(h("   ", true, true), "topo")).toBeNull();
  });

  test("ausente não quebra", () => {
    expect(horarioDoLocal(undefined, "topo")).toBeNull();
    expect(horarioDoLocal(undefined, "rodape")).toBeNull();
  });

  test("normaliza: apara e colapsa espaços", () => {
    expect(normalizarHorario("  Seg  a   Sex,  9h  ")).toBe("Seg a Sex, 9h");
    expect(horarioDoLocal(h("  Seg a Sex  ", true), "topo")).toBe("Seg a Sex");
  });

  test("vazio normaliza para null, nunca string vazia", () => {
    expect(normalizarHorario("")).toBeNull();
    expect(normalizarHorario("   ")).toBeNull();
    expect(normalizarHorario(null)).toBeNull();
    expect(normalizarHorario(undefined)).toBeNull();
  });

  test("marcação é detectada para ser recusada na entrada", () => {
    expect(horarioTemMarcacao("<b>9h</b>")).toBe(true);
    expect(horarioTemMarcacao("<script>alert(1)</script>")).toBe(true);
    expect(horarioTemMarcacao("Seg a Sex, 9h às 18h")).toBe(false);
    expect(horarioTemMarcacao("das 9h > 18h")).toBe(true);
  });

  test("o limite de caracteres é o da barra, não arbitrário", () => {
    expect(LIMITE_HORARIO_ATENDIMENTO).toBe(120);
    expect("Atendimento de segunda a sábado, das 8h às 18h".length).toBeLessThan(
      LIMITE_HORARIO_ATENDIMENTO
    );
  });

  test("o horário NÃO é um canal — não tem href nem entra no catálogo", () => {
    expect(CANAIS_PUBLICOS.map((c) => c.chave)).not.toContain("horario");
  });

  // -------------------------------------------------------------------
  // Fase 58.3 — as quatro combinações, uma a uma
  // -------------------------------------------------------------------
  const TEXTO = "Segunda a sexta, das 9h às 18h";

  test("topo sim / rodapé não -> só no topo", () => {
    const c = h(TEXTO, true, false);
    expect(horarioDoLocal(c, "topo")).toBe(TEXTO);
    expect(horarioDoLocal(c, "rodape")).toBeNull();
  });

  test("topo não / rodapé sim -> só no rodapé", () => {
    const c = h(TEXTO, false, true);
    expect(horarioDoLocal(c, "topo")).toBeNull();
    expect(horarioDoLocal(c, "rodape")).toBe(TEXTO);
  });

  test("ambos -> nos dois, com o MESMO texto", () => {
    const c = h(TEXTO, true, true);
    expect(horarioDoLocal(c, "topo")).toBe(TEXTO);
    expect(horarioDoLocal(c, "rodape")).toBe(TEXTO);
    // Uma fonte só: nunca dois horários diferentes.
    expect(horarioDoLocal(c, "topo")).toBe(horarioDoLocal(c, "rodape"));
  });

  test("nenhum -> fica salvo e invisível nos dois", () => {
    const c = h(TEXTO, false, false);
    expect(horarioDoLocal(c, "topo")).toBeNull();
    expect(horarioDoLocal(c, "rodape")).toBeNull();
    expect(c.valor).toBe(TEXTO);
  });

  test("horarioDoTopo continua sendo o atalho do topo", () => {
    expect(horarioDoTopo(h(TEXTO, true, true))).toBe(horarioDoLocal(h(TEXTO, true, true), "topo"));
    expect(horarioDoTopo(h(TEXTO, false, true))).toBeNull();
  });
});

// =======================================================================
// Separadores da barra superior (Fase 58.4)
// =======================================================================
// As oito combinações de grupos, uma a uma. A regra é por GRUPO, então
// nenhuma combinação recebe tratamento especial no código.

describe("separadores da barra", () => {
  const g = (temHorario: boolean, temRedes: boolean, temContatos: boolean) =>
    separadoresDaBarra({ temHorario, temRedes, temContatos });

  /** Quantos traços aparecem no desktop, onde todos os grupos são visíveis. */
  const noDesktop = (s: ReturnType<typeof separadoresDaBarra>) =>
    (s.antesDasRedes ? 1 : 0) + (s.antesDosContatos ? 1 : 0);

  /** Quantos aparecem no mobile, onde as redes estão escondidas. */
  const noMobile = (s: ReturnType<typeof separadoresDaBarra>) =>
    s.antesDasRedes && !s.antesDasRedesSoNoDesktop ? 1 : 0;

  test("horário + redes + contatos -> dois traços no desktop", () => {
    const s = g(true, true, true);
    expect(noDesktop(s)).toBe(2);
    // No mobile as redes somem e sobra UM traço, separando horário de
    // contatos — o mesmo elemento, reaproveitado.
    expect(noMobile(s)).toBe(1);
  });

  test("horário + redes -> um traço, e nenhum no mobile", () => {
    const s = g(true, true, false);
    expect(noDesktop(s)).toBe(1);
    // Sem contatos, no mobile não sobraria nada depois do traço.
    expect(noMobile(s)).toBe(0);
  });

  test("horário + contatos -> um traço, também no mobile", () => {
    const s = g(true, false, true);
    expect(noDesktop(s)).toBe(1);
    expect(noMobile(s)).toBe(1);
  });

  test("redes + contatos -> um traço no desktop, nenhum no mobile", () => {
    const s = g(false, true, true);
    expect(noDesktop(s)).toBe(1);
    expect(noMobile(s)).toBe(0);
  });

  test("somente horário -> nenhum traço", () => {
    expect(noDesktop(g(true, false, false))).toBe(0);
    expect(noMobile(g(true, false, false))).toBe(0);
  });

  test("somente redes -> nenhum traço", () => {
    expect(noDesktop(g(false, true, false))).toBe(0);
  });

  test("somente contatos -> nenhum traço", () => {
    expect(noDesktop(g(false, false, true))).toBe(0);
  });

  test("nenhum grupo -> nenhum traço", () => {
    expect(noDesktop(g(false, false, false))).toBe(0);
    expect(noMobile(g(false, false, false))).toBe(0);
  });

  test("nunca há traço sem conteúdo dos dois lados", () => {
    for (const h of [true, false]) {
      for (const r of [true, false]) {
        for (const c of [true, false]) {
          const s = g(h, r, c);
          // O traço antes das redes exige horário à esquerda e ALGO à direita.
          if (s.antesDasRedes) expect(h && (r || c)).toBe(true);
          // O traço antes dos contatos exige redes à esquerda e contatos à direita.
          if (s.antesDosContatos) expect(r && c).toBe(true);
        }
      }
    }
  });
});
