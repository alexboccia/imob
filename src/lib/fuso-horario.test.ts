import { describe, test, expect } from "vitest";
import {
  FUSO_PADRAO,
  fusoValido,
  resolverFuso,
  componentesNoFuso,
  instanteDeComponentes,
  intervaloDoDia,
  intervaloDoDiaDeslocado,
  numeroDoDia,
  inicioDoDiaPorNumero,
  chaveDoDia,
  chaveDoMes,
  inicioDoMesNoFuso,
  mesmoDia,
  formatarDataHoraNoFuso,
  formatarDataNoFuso,
  formatarHoraNoFuso,
  deDatetimeLocalNoFuso,
  paraDatetimeLocalNoFuso,
  parseDataCalendario,
  intervaloDaDataCalendario,
  rotuloFuso,
  cidadeDoFuso,
  offsetDoFuso,
} from "./fuso-horario";

// =======================================================================
// Fuso horário e calendário comercial (Fase 18)
// =======================================================================
// Testes puros, sem banco e sem DOM. RELÓGIO SEMPRE FIXO: nenhum caso
// depende de `new Date()` real, então o resultado é o mesmo em qualquer
// máquina e em qualquer horário de execução.
//
// O arquivo também prova INDEPENDÊNCIA DO FUSO DO PROCESSO: os mesmos
// casos rodam com process.env.TZ forçado em UTC, São Paulo e Tóquio.
// Isso não duplica a suíte inteira — só o núcleo, que é onde o
// acoplamento com o ambiente apareceria.

const SP = "America/Sao_Paulo";
const NY = "America/New_York";
const LISBOA = "Europe/Lisbon";

const TZS_DO_PROCESSO = ["UTC", "America/Sao_Paulo", "Asia/Tokyo"];

function comTimezoneDoProcesso<T>(tz: string, fn: () => T): T {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

const horas = (inicio: Date, fim: Date) => (fim.getTime() + 1 - inicio.getTime()) / 3_600_000;

// -----------------------------------------------------------------------
describe("validação de fuso (IANA, nunca offset fixo)", () => {
  test.each(["UTC", "America/Sao_Paulo", "Europe/Lisbon", "America/New_York", "America/Manaus"])(
    "%s é um fuso IANA válido",
    (fuso) => {
      expect(fusoValido(fuso)).toBe(true);
    }
  );

  // Intl.DateTimeFormat sozinho ACEITA todos estes — é exatamente por
  // isso que a validação é uma allowlist canônica, não um try/catch.
  test.each(["-03:00", "+03:00", "Etc/GMT+3", "GMT-3"])(
    "%s é recusado: offset fixo não descreve DST",
    (valor) => {
      expect(fusoValido(valor)).toBe(false);
    }
  );

  test.each(["", "   ", "Foo/Bar", "america/sao_paulo", "AMERICA/SAO_PAULO", "São Paulo"])(
    "%j é recusado",
    (valor) => {
      expect(fusoValido(valor)).toBe(false);
    }
  );

  test("valores não-string são recusados sem lançar", () => {
    for (const valor of [null, undefined, 42, {}, [], true]) {
      expect(fusoValido(valor)).toBe(false);
    }
  });
});

describe("fallback explícito", () => {
  test("o padrão é UTC — o comportamento histórico do produto", () => {
    expect(FUSO_PADRAO).toBe("UTC");
  });

  test("null e undefined (organização que nunca configurou) caem em UTC", () => {
    expect(resolverFuso(null)).toBe("UTC");
    expect(resolverFuso(undefined)).toBe("UTC");
  });

  test("valor inválido no banco cai no fallback em vez de quebrar a tela", () => {
    expect(resolverFuso("Foo/Bar")).toBe("UTC");
    expect(resolverFuso("-03:00")).toBe("UTC");
  });

  test("fuso válido é devolvido intacto", () => {
    expect(resolverFuso(SP)).toBe(SP);
    expect(resolverFuso(LISBOA)).toBe(LISBOA);
  });
});

// -----------------------------------------------------------------------
describe("dia calendário — casos obrigatórios do Brasil", () => {
  // UTC 08/09 00:30 é 07/09 21:30 em São Paulo: o dia comercial ainda é 07.
  test("UTC 08/09 00:30 pertence ao dia 07/09 em São Paulo", () => {
    const instante = new Date("2026-09-08T00:30:00.000Z");
    expect(chaveDoDia(instante, SP)).toBe("2026-09-07");
    expect(chaveDoDia(instante, "UTC")).toBe("2026-09-08");

    const { inicio, fim } = intervaloDoDia(instante, SP);
    expect(inicio.toISOString()).toBe("2026-09-07T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-09-08T02:59:59.999Z");
  });

  // Caso inverso: UTC 07/09 02:00 é 06/09 23:00 em São Paulo.
  test("UTC 07/09 02:00 pertence ao dia 06/09 em São Paulo", () => {
    const instante = new Date("2026-09-07T02:00:00.000Z");
    expect(chaveDoDia(instante, SP)).toBe("2026-09-06");
    expect(intervaloDoDia(instante, SP).inicio.toISOString()).toBe("2026-09-06T03:00:00.000Z");
  });

  test("as duas visitas da borda caem no MESMO dia UTC e em dias diferentes em São Paulo", () => {
    const fimDoDia = new Date("2026-09-08T02:30:00.000Z"); // 07/09 23:30 SP
    const comecoDeAmanha = new Date("2026-09-08T03:15:00.000Z"); // 08/09 00:15 SP
    expect(chaveDoDia(fimDoDia, "UTC")).toBe(chaveDoDia(comecoDeAmanha, "UTC"));
    expect(chaveDoDia(fimDoDia, SP)).toBe("2026-09-07");
    expect(chaveDoDia(comecoDeAmanha, SP)).toBe("2026-09-08");
    expect(mesmoDia(fimDoDia, comecoDeAmanha, SP)).toBe(false);
    expect(mesmoDia(fimDoDia, comecoDeAmanha, "UTC")).toBe(true);
  });
});

describe("bordas do dia", () => {
  test("00:00:00.000 local pertence ao próprio dia; o milissegundo anterior, ao dia anterior", () => {
    const inicio = intervaloDoDia(new Date("2026-09-07T12:00:00.000Z"), SP).inicio;
    expect(chaveDoDia(inicio, SP)).toBe("2026-09-07");
    expect(chaveDoDia(new Date(inicio.getTime() - 1), SP)).toBe("2026-09-06");
  });

  test("23:59:59.999 local pertence ao próprio dia; o milissegundo seguinte, ao dia seguinte", () => {
    const fim = intervaloDoDia(new Date("2026-09-07T12:00:00.000Z"), SP).fim;
    expect(chaveDoDia(fim, SP)).toBe("2026-09-07");
    expect(chaveDoDia(new Date(fim.getTime() + 1), SP)).toBe("2026-09-08");
  });

  test("o intervalo do dia não depende da HORA de referência dentro do dia", () => {
    const manha = intervaloDoDia(new Date("2026-09-07T09:00:00.000Z"), SP);
    const noite = intervaloDoDia(new Date("2026-09-08T02:00:00.000Z"), SP);
    expect(noite.inicio.getTime()).toBe(manha.inicio.getTime());
    expect(noite.fim.getTime()).toBe(manha.fim.getTime());
  });
});

// -----------------------------------------------------------------------
describe("DST — o dia NÃO tem 24 horas", () => {
  // Nova York: 08/03/2026 entra no horário de verão (o relógio pula
  // 02:00 -> 03:00) e 01/11/2026 sai dele (01:00 acontece duas vezes).
  test("dia de início de DST em Nova York tem 23 horas", () => {
    const { inicio, fim } = intervaloDoDia(new Date("2026-03-08T18:00:00.000Z"), NY);
    expect(horas(inicio, fim)).toBe(23);
    expect(chaveDoDia(inicio, NY)).toBe("2026-03-08");
    expect(chaveDoDia(fim, NY)).toBe("2026-03-08");
  });

  test("dia de fim de DST em Nova York tem 25 horas", () => {
    const { inicio, fim } = intervaloDoDia(new Date("2026-11-01T18:00:00.000Z"), NY);
    expect(horas(inicio, fim)).toBe(25);
    expect(chaveDoDia(inicio, NY)).toBe("2026-11-01");
    expect(chaveDoDia(fim, NY)).toBe("2026-11-01");
  });

  test("dia comum em Nova York tem 24 horas — a diferença acima é DST, não erro de conta", () => {
    const { inicio, fim } = intervaloDoDia(new Date("2026-06-15T18:00:00.000Z"), NY);
    expect(horas(inicio, fim)).toBe(24);
  });

  test("horário INEXISTENTE (o pulo da primavera) resolve de forma determinística, sem lançar", () => {
    // 02:30 de 08/03/2026 não existe em Nova York.
    const instante = instanteDeComponentes(
      { ano: 2026, mes: 3, dia: 8, hora: 2, minuto: 30 },
      NY
    );
    expect(Number.isNaN(instante.getTime())).toBe(false);
    // Resolve para depois da transição, ainda dentro do dia 08.
    expect(chaveDoDia(instante, NY)).toBe("2026-03-08");
    expect(instante.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  test("horário REPETIDO (o recuo do outono) resolve para a primeira ocorrência", () => {
    // 01:30 de 01/11/2026 acontece duas vezes em Nova York (-04:00 e -05:00).
    const instante = instanteDeComponentes(
      { ano: 2026, mes: 11, dia: 1, hora: 1, minuto: 30 },
      NY
    );
    expect(instante.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(componentesNoFuso(instante, NY).hora).toBe(1);
  });

  test("atravessar DST não desloca a contagem de dias — 30 dias são 30 voltas de calendário", () => {
    // Janela de 30 dias terminando depois do fim do DST: contém um dia de
    // 25 horas, então 29 × 24h NÃO é 29 dias de calendário.
    const agora = new Date("2026-11-10T18:00:00.000Z");
    const inicio = intervaloDoDiaDeslocado(agora, NY, -29).inicio;

    // O início da janela é exatamente a meia-noite local do dia certo.
    expect(chaveDoDia(inicio, NY)).toBe("2026-10-12");
    expect(componentesNoFuso(inicio, NY).hora).toBe(0);
    expect(numeroDoDia(agora, NY) - numeroDoDia(inicio, NY)).toBe(29);

    // A aritmética por milissegundos erra em uma hora: a janela começaria
    // à 01:00 local, e todo evento da primeira hora daquele dia ficaria de
    // fora da contagem sem nenhum sinal na tela.
    const porMilissegundos = new Date(
      intervaloDoDia(agora, NY).inicio.getTime() - 29 * 86_400_000
    );
    expect(componentesNoFuso(porMilissegundos, NY).hora).toBe(1);
    expect(porMilissegundos.getTime()).not.toBe(inicio.getTime());
  });

  // O horário de verão brasileiro (extinto em 2019) virava À MEIA-NOITE,
  // o que torna o próprio INÍCIO/FIM do dia a hora ambígua. É o caso mais
  // difícil, e o produto lê datas passadas (closedAt, occurredAt,
  // Analytics de períodos anteriores).
  test("DST histórico do Brasil: o dia em que o relógio pulou 00:00 -> 01:00 tem 23 horas e começa às 01:00", () => {
    const { inicio, fim } = intervaloDoDia(new Date("2018-11-04T15:00:00.000Z"), SP);
    expect(horas(inicio, fim)).toBe(23);
    // Início do dia 04 é 01:00 local — resolvido PARA A FRENTE. Resolver
    // para trás daria 23:00 do dia 03, roubando uma hora do dia anterior.
    expect(inicio.toISOString()).toBe("2018-11-04T03:00:00.000Z");
    expect(componentesNoFuso(inicio, SP).dia).toBe(4);
    expect(componentesNoFuso(inicio, SP).hora).toBe(1);
    expect(chaveDoDia(inicio, SP)).toBe("2018-11-04");
    expect(chaveDoDia(fim, SP)).toBe("2018-11-04");
  });

  test("DST histórico do Brasil: o dia em que 00:00 voltou para 23:00 tem 25 horas e termina completo", () => {
    const { inicio, fim } = intervaloDoDia(new Date("2019-02-16T15:00:00.000Z"), SP);
    expect(horas(inicio, fim)).toBe(25);
    expect(chaveDoDia(inicio, SP)).toBe("2019-02-16");
    expect(chaveDoDia(fim, SP)).toBe("2019-02-16");
    // A hora REPETIDA (23:00 acontece duas vezes) fica dentro do dia 16:
    // ancorar o fim no início do dia seguinte é o que evita perdê-la.
    expect(fim.toISOString()).toBe("2019-02-17T02:59:59.999Z");
  });

  test("dias consecutivos se encaixam sem lacuna nem sobreposição, mesmo em transição", () => {
    for (const dia of ["2018-11-04", "2019-02-16", "2026-03-08", "2026-11-01"]) {
      const fuso = dia.startsWith("2026") ? NY : SP;
      const hoje = intervaloDoDia(new Date(`${dia}T15:00:00.000Z`), fuso);
      const amanha = intervaloDoDiaDeslocado(new Date(`${dia}T15:00:00.000Z`), fuso, 1);
      expect(amanha.inicio.getTime() - hoje.fim.getTime()).toBe(1);
    }
  });

  test("São Paulo não usa DST hoje, mas o helper não assume isso", () => {
    for (const dia of ["2026-01-15", "2026-06-15", "2026-10-18", "2026-11-05"]) {
      const { inicio, fim } = intervaloDoDia(new Date(`${dia}T15:00:00.000Z`), SP);
      expect(horas(inicio, fim)).toBe(24);
      expect(chaveDoDia(inicio, SP)).toBe(chaveDoDia(fim, SP));
    }
  });
});

// -----------------------------------------------------------------------
describe("aritmética de calendário", () => {
  test("deslocamento negativo atravessa a virada de mês", () => {
    const inicio = intervaloDoDiaDeslocado(new Date("2026-09-03T12:00:00.000Z"), SP, -5).inicio;
    expect(chaveDoDia(inicio, SP)).toBe("2026-08-29");
  });

  test("deslocamento atravessa a virada de ano", () => {
    const inicio = intervaloDoDiaDeslocado(new Date("2027-01-02T12:00:00.000Z"), SP, -3).inicio;
    expect(chaveDoDia(inicio, SP)).toBe("2026-12-30");
  });

  test("ano bissexto: 29 de fevereiro existe e é contado", () => {
    const inicio = intervaloDoDiaDeslocado(new Date("2028-03-01T12:00:00.000Z"), SP, -1).inicio;
    expect(chaveDoDia(inicio, SP)).toBe("2028-02-29");
  });

  test("numeroDoDia e inicioDoDiaPorNumero são inversos", () => {
    const instante = new Date("2026-09-08T01:00:00.000Z"); // 07/09 22:00 SP
    const numero = numeroDoDia(instante, SP);
    const inicio = inicioDoDiaPorNumero(numero, SP);
    expect(inicio.toISOString()).toBe(intervaloDoDia(instante, SP).inicio.toISOString());
    expect(numeroDoDia(inicio, SP)).toBe(numero);
  });

  test("início do mês respeita o fuso e desloca por MESES, não por 30 dias", () => {
    const agora = new Date("2026-09-07T12:00:00.000Z");
    expect(inicioDoMesNoFuso(agora, SP).toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(chaveDoMes(inicioDoMesNoFuso(agora, SP, -5), SP)).toBe("2026-04");
    expect(chaveDoMes(inicioDoMesNoFuso(agora, SP, -9), SP)).toBe("2025-12");
  });

  test("um instante da madrugada do dia 1º pertence a meses diferentes em UTC e em São Paulo", () => {
    const instante = new Date("2026-10-01T02:00:00.000Z"); // 30/09 23:00 SP
    expect(chaveDoMes(instante, "UTC")).toBe("2026-10");
    expect(chaveDoMes(instante, SP)).toBe("2026-09");
  });
});

// -----------------------------------------------------------------------
describe("datetime-local <-> instante", () => {
  test("14:30 digitado em São Paulo vira 17:30 UTC no banco", () => {
    expect(deDatetimeLocalNoFuso("2026-09-07T14:30", SP)!.toISOString()).toBe(
      "2026-09-07T17:30:00.000Z"
    );
  });

  test("o mesmo texto em UTC vira 14:30 UTC — o fuso é quem decide", () => {
    expect(deDatetimeLocalNoFuso("2026-09-07T14:30", "UTC")!.toISOString()).toBe(
      "2026-09-07T14:30:00.000Z"
    );
  });

  test("ida e volta preserva exatamente o que foi digitado", () => {
    for (const fuso of ["UTC", SP, NY, LISBOA]) {
      for (const texto of ["2026-09-07T14:30", "2026-01-01T00:00", "2026-12-31T23:59"]) {
        const instante = deDatetimeLocalNoFuso(texto, fuso)!;
        expect(paraDatetimeLocalNoFuso(instante, fuso)).toBe(texto);
      }
    }
  });

  test("data inexistente no calendário é recusada, nunca 'rolada' para o mês seguinte", () => {
    expect(deDatetimeLocalNoFuso("2026-02-30T10:00", SP)).toBeNull();
    expect(deDatetimeLocalNoFuso("2026-13-01T10:00", SP)).toBeNull();
    expect(deDatetimeLocalNoFuso("2027-02-29T10:00", SP)).toBeNull();
  });

  test("2028-02-29 existe (ano bissexto) e é aceito", () => {
    expect(deDatetimeLocalNoFuso("2028-02-29T10:00", SP)).not.toBeNull();
  });

  test("formato inválido devolve null em vez de lançar", () => {
    for (const texto of ["", "07/09/2026 14:30", "2026-09-07", "2026-09-07T14:30:00", "abc"]) {
      expect(deDatetimeLocalNoFuso(texto, SP)).toBeNull();
    }
  });

  test("hora/minuto fora de faixa são recusados", () => {
    expect(deDatetimeLocalNoFuso("2026-09-07T24:00", SP)).toBeNull();
    expect(deDatetimeLocalNoFuso("2026-09-07T10:60", SP)).toBeNull();
  });
});

describe("date-only (filtro de período)", () => {
  test("devolve componentes, não instante — a data não tem fuso", () => {
    expect(parseDataCalendario("2026-08-20")).toEqual({ ano: 2026, mes: 8, dia: 20 });
  });

  test("data inexistente e formato inválido devolvem null", () => {
    expect(parseDataCalendario("2026-02-30")).toBeNull();
    expect(parseDataCalendario("20/08/2026")).toBeNull();
    expect(parseDataCalendario("")).toBeNull();
  });

  test("a MESMA data vira instantes diferentes em fusos diferentes", () => {
    const data = parseDataCalendario("2026-08-20")!;
    expect(intervaloDaDataCalendario(data, "UTC").inicio.toISOString()).toBe(
      "2026-08-20T00:00:00.000Z"
    );
    expect(intervaloDaDataCalendario(data, SP).inicio.toISOString()).toBe(
      "2026-08-20T03:00:00.000Z"
    );
  });
});

// -----------------------------------------------------------------------
describe("formatação", () => {
  const instante = new Date("2026-09-08T00:30:00.000Z");

  test("o mesmo instante é exibido conforme o fuso da organização", () => {
    expect(formatarDataHoraNoFuso(instante, "UTC")).toBe("08/09/2026, 00:30");
    expect(formatarDataHoraNoFuso(instante, SP)).toBe("07/09/2026, 21:30");
    expect(formatarDataNoFuso(instante, SP)).toBe("07/09/2026");
    expect(formatarHoraNoFuso(instante, SP)).toBe("21:30");
  });

  test("aceita Date e string ISO indistintamente", () => {
    expect(formatarDataHoraNoFuso(instante.toISOString(), SP)).toBe(
      formatarDataHoraNoFuso(instante, SP)
    );
  });

  test("o locale continua pt-BR — locale e fuso são coisas diferentes", () => {
    expect(formatarDataNoFuso(instante, NY)).toBe("07/09/2026");
  });
});

describe("rótulo humano do fuso", () => {
  test("mostra cidade e offset, mas o valor persistido é o identificador IANA", () => {
    const inverno = new Date("2026-01-15T12:00:00.000Z");
    expect(rotuloFuso(SP, inverno)).toBe("São Paulo (UTC−03:00)");
    expect(rotuloFuso("UTC", inverno)).toBe("UTC");
    expect(cidadeDoFuso("America/New_York")).toBe("New York");
  });

  test("o offset é calculado PARA UM INSTANTE — em DST ele muda", () => {
    expect(offsetDoFuso(NY, new Date("2026-01-15T12:00:00.000Z"))).toBe("UTC−05:00");
    expect(offsetDoFuso(NY, new Date("2026-07-15T12:00:00.000Z"))).toBe("UTC−04:00");
  });

  test("fuso com offset fracionário é rotulado com os minutos", () => {
    expect(offsetDoFuso("Asia/Kolkata", new Date("2026-01-15T12:00:00.000Z"))).toBe("UTC+05:30");
  });
});

// -----------------------------------------------------------------------
describe("independência do fuso do PROCESSO", () => {
  // O CI pode rodar em qualquer TZ. Se qualquer helper usasse um getter
  // local (getHours, setHours, new Date("...sem Z")), estes casos
  // divergiriam — foi exatamente esse acoplamento que a Fase 18 removeu
  // de crm-listagem.ts e dashboard.ts.
  test.each(TZS_DO_PROCESSO)("com TZ=%s o resultado é idêntico", (tz) => {
    comTimezoneDoProcesso(tz, () => {
      const instante = new Date("2026-09-08T00:30:00.000Z");
      expect(chaveDoDia(instante, SP)).toBe("2026-09-07");
      expect(intervaloDoDia(instante, SP).inicio.toISOString()).toBe("2026-09-07T03:00:00.000Z");
      expect(intervaloDoDia(instante, SP).fim.toISOString()).toBe("2026-09-08T02:59:59.999Z");
      expect(deDatetimeLocalNoFuso("2026-09-07T14:30", SP)!.toISOString()).toBe(
        "2026-09-07T17:30:00.000Z"
      );
      expect(paraDatetimeLocalNoFuso(instante, SP)).toBe("2026-09-07T21:30");
      expect(formatarDataHoraNoFuso(instante, SP)).toBe("07/09/2026, 21:30");
      expect(numeroDoDia(instante, SP)).toBe(numeroDoDia(instante, "UTC") - 1);
      expect(chaveDoMes(new Date("2026-10-01T02:00:00.000Z"), SP)).toBe("2026-09");
    });
  });
});
