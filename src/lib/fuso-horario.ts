// =======================================================================
// Fuso horário e calendário comercial (Fase 18)
// =======================================================================
// A regra que este arquivo existe para sustentar:
//
//     INSTANTE  ≠  DIA CALENDÁRIO
//
// O banco continua guardando INSTANTES absolutos (Prisma DateTime, UTC).
// Nada aqui converte, reescreve ou "localiza" o que está persistido. O
// fuso serve para INTERPRETAR conceitos de calendário comercial — "hoje",
// "início do dia", "últimos N dias", "a data exibida" — no contexto da
// organização, que é quem tem um expediente, não o servidor nem o
// navegador de quem está olhando a tela.
//
// Antes desta fase o projeto usava a convenção UTC-literal
// (inicioDoDiaUTC/fimDoDiaUTC). Para uma imobiliária em UTC−3 isso fazia
// o "dia seguinte" começar às 21:00 locais: uma visita marcada para
// 07/09 22:00 em São Paulo já contava como 08/09. É esse defeito que os
// helpers abaixo corrigem.
//
// -----------------------------------------------------------------------
// SEM BIBLIOTECA
// -----------------------------------------------------------------------
// Nenhuma dependência nova. O projeto não tem date-fns/Luxon/dayjs, e o
// runtime (Node 20+ / navegadores atuais) já traz o banco de dados IANA
// completo via Intl — inclusive regras de DST históricas e futuras. O que
// NÃO se faz aqui, em nenhuma linha, é aritmética manual de offset
// ("subtrai 3 horas"): todo cálculo pergunta ao Intl qual era o offset
// NAQUELE instante, que é a única forma de acertar DST.
// =======================================================================

// Fallback explícito para organização sem fuso configurado. É UTC de
// propósito, não America/Sao_Paulo: UTC é EXATAMENTE o comportamento
// histórico do produto, então uma organização legada que nunca configurou
// nada não tem o calendário deslocado silenciosamente por baixo dela.
// Escolher o fuso é uma decisão da organização, não uma inferência nossa.
export const FUSO_PADRAO = "UTC";

// Allowlist canônica do runtime. Intl.DateTimeFormat sozinho NÃO serve
// como validação: ele aceita "-03:00", "utc" e "Etc/GMT+3" sem reclamar.
// Offset fixo é justamente o que não podemos persistir — "-03:00" não
// descreve DST nenhum, nem passado nem futuro. Então a validação é
// pertencer à lista canônica IANA do runtime, mais "UTC" (que
// supportedValuesOf não inclui, mas é o nosso fallback).
const FUSOS_CANONICOS: ReadonlySet<string> = new Set([
  ...Intl.supportedValuesOf("timeZone"),
  "UTC",
]);

export function fusoValido(valor: unknown): valor is string {
  return typeof valor === "string" && FUSOS_CANONICOS.has(valor);
}

// Fuso efetivo de uma organização. null/undefined (nunca configurado) e
// qualquer valor que tenha deixado de ser canônico numa atualização de
// tzdata caem no padrão — uma tela nunca quebra por causa disso, e o
// comportamento é o histórico, nunca um fuso adivinhado.
export function resolverFuso(valor: string | null | undefined): string {
  return fusoValido(valor) ? valor : FUSO_PADRAO;
}

// -----------------------------------------------------------------------
// Núcleo: instante <-> componentes de calendário
// -----------------------------------------------------------------------

export type ComponentesCalendario = {
  ano: number;
  mes: number; // 1-12, como o ser humano escreve
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
  ms: number;
};

const CACHE_FORMATADORES = new Map<string, Intl.DateTimeFormat>();

// Intl.DateTimeFormat é caro de construir e este caminho roda por item de
// lista. O cache é por fuso, imutável e sem estado por request — não há
// dado de tenant aqui, só a configuração do formatador.
function formatadorDeComponentes(fuso: string): Intl.DateTimeFormat {
  let formatador = CACHE_FORMATADORES.get(fuso);
  if (!formatador) {
    formatador = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      // h23 (nunca hour12:false puro): sem isso alguns runtimes emitem
      // "24" para meia-noite, e 24 viraria o dia seguinte no cálculo.
      hourCycle: "h23",
      era: "short",
    });
    CACHE_FORMATADORES.set(fuso, formatador);
  }
  return formatador;
}

// Componentes de calendário de um instante, no fuso pedido.
export function componentesNoFuso(instante: Date, fuso: string): ComponentesCalendario {
  const partes = formatadorDeComponentes(fuso).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? "0");
  // Datas anteriores a Cristo não aparecem no produto, mas ignorar a era
  // faria o ano 1 a.C. virar ano 1 d.C. silenciosamente — barato demais
  // para não tratar.
  const era = partes.find((p) => p.type === "era")?.value;
  const ano = era === "BC" ? 1 - valor("year") : valor("year");
  return {
    ano,
    mes: valor("month"),
    dia: valor("day"),
    hora: valor("hour"),
    minuto: valor("minute"),
    segundo: valor("second"),
    ms: instante.getUTCMilliseconds(),
  };
}

// Offset do fuso NAQUELE instante, em ms (positivo a leste de Greenwich).
// Derivado do próprio Intl — nunca de uma tabela nossa de offsets.
export function deslocamentoMs(instante: Date, fuso: string): number {
  const c = componentesNoFuso(instante, fuso);
  const comoSeFosseUTC = Date.UTC(c.ano, c.mes - 1, c.dia, c.hora, c.minuto, c.segundo, c.ms);
  return comoSeFosseUTC - instante.getTime();
}

// Inverso: dado um horário de PAREDE no fuso, qual instante absoluto é.
//
// Os campos podem estar fora de faixa (dia 0, dia 32, mês 13) — Date.UTC
// normaliza, e é justamente isso que permite fazer aritmética de
// calendário ("três dias antes") sem inventar um algoritmo de datas.
//
// Duas passagens porque o offset depende do instante que estamos tentando
// descobrir: o primeiro palpite usa o offset do horário lido como se
// fosse UTC, e a segunda passagem corrige quando o palpite caiu do outro
// lado de uma transição de DST.
//
// A terceira etapa é o que realmente importa nas bordas. Quando as duas
// passagens discordam, estamos em cima de uma transição, e há dois casos:
//
//   - HORA REPETIDA (outono, 01:30 acontece duas vezes): a segunda
//     passagem devolve um instante cujo horário de parede É o pedido —
//     resolve para a primeira ocorrência, deterministicamente.
//
//   - HORA INEXISTENTE (primavera, o relógio pula): NENHUM instante tem
//     aquele horário de parede. Aqui a conversão resolve PARA A FRENTE,
//     logo após o pulo — nunca para trás. Isso não é detalhe: o horário
//     de verão brasileiro histórico começava à MEIA-NOITE (ex: São Paulo,
//     04/11/2018, 00:00 -> 01:00), e resolver para trás faria o "início
//     do dia 04" cair às 23:00 do dia 03, jogando uma hora inteira do dia
//     anterior para dentro do dia seguinte.
export function instanteDeComponentes(
  componentes: Partial<ComponentesCalendario> & { ano: number; mes: number; dia: number },
  fuso: string
): Date {
  const { ano, mes, dia } = componentes;
  const hora = componentes.hora ?? 0;
  const minuto = componentes.minuto ?? 0;
  const segundo = componentes.segundo ?? 0;
  const ms = componentes.ms ?? 0;
  const relogio = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo, ms);

  const offsetInicial = deslocamentoMs(new Date(relogio), fuso);
  const candidatoAvancado = new Date(relogio - offsetInicial);
  const offsetCorrigido = deslocamentoMs(candidatoAvancado, fuso);
  if (offsetCorrigido === offsetInicial) return candidatoAvancado;

  const candidatoCorrigido = new Date(relogio - offsetCorrigido);
  const c = componentesNoFuso(candidatoCorrigido, fuso);
  const bate =
    c.hora === hora && c.minuto === minuto && c.segundo === segundo && c.dia === dia;
  // `candidatoAvancado` é o que usa o offset de ANTES da transição, e é
  // por isso que ele cai depois do pulo — a resolução para a frente.
  return bate ? candidatoCorrigido : candidatoAvancado;
}

// -----------------------------------------------------------------------
// Dia calendário da organização
// -----------------------------------------------------------------------

export type DataCalendario = { ano: number; mes: number; dia: number };

export type IntervaloDia = { inicio: Date; fim: Date };

// [00:00:00.000, 23:59:59.999] do dia calendário local, devolvido como
// dois INSTANTES UTC — a forma que uma query Prisma sobre DateTime
// consegue usar diretamente.
//
// NUNCA assuma fim - início = 24h: num dia de início de DST são 23h, num
// dia de fim de DST são 25h. A duração é CONSEQUÊNCIA, nunca premissa.
//
// O fim é sempre "o início do dia seguinte menos 1 milissegundo", e não a
// conversão literal de 23:59:59.999. Os dois coincidem no caso normal,
// mas em fuso cuja transição cai à meia-noite (o horário de verão
// brasileiro histórico terminava assim: 17/02/2019, 00:00 -> 23:00 do dia
// 16) o horário 23:59:59.999 é AMBÍGUO, e escolher a primeira ocorrência
// encerraria o dia uma hora cedo, deixando uma hora inteira de dados fora
// de qualquer dia. Ancorar no início do dia seguinte é exato sempre e não
// deixa lacuna nem sobreposição entre dias consecutivos.
function limitesDoDiaCalendario(data: DataCalendario, fuso: string): IntervaloDia {
  const inicio = instanteDeComponentes({ ...data, hora: 0 }, fuso);
  const inicioDoSeguinte = instanteDeComponentes({ ...data, dia: data.dia + 1, hora: 0 }, fuso);
  return { inicio, fim: new Date(inicioDoSeguinte.getTime() - 1) };
}

export function intervaloDoDia(instante: Date, fuso: string): IntervaloDia {
  const { ano, mes, dia } = componentesNoFuso(instante, fuso);
  return limitesDoDiaCalendario({ ano, mes, dia }, fuso);
}

export function inicioDoDiaNoFuso(instante: Date, fuso: string): Date {
  return intervaloDoDia(instante, fuso).inicio;
}

export function fimDoDiaNoFuso(instante: Date, fuso: string): Date {
  return intervaloDoDia(instante, fuso).fim;
}

// Dia calendário deslocado por N dias (negativo = passado), no fuso — a
// aritmética acontece no CAMPO dia e a normalização fica com Date.UTC, o
// que mantém a conta correta mesmo atravessando DST, fim de mês e ano
// bissexto. "Sete dias atrás" é sete voltas de calendário, nunca
// 7 × 24 × 60 × 60 × 1000 ms.
export function intervaloDoDiaDeslocado(instante: Date, fuso: string, dias: number): IntervaloDia {
  const { ano, mes, dia } = componentesNoFuso(instante, fuso);
  const referencia = instanteDeComponentes({ ano, mes, dia: dia + dias, hora: 12 }, fuso);
  return intervaloDoDia(referencia, fuso);
}

// Número do dia calendário desde a época, no fuso. Serve para comparar e
// para bucketizar por dia sem depender de duração: dois instantes com o
// mesmo número estão no mesmo dia comercial da organização, e a diferença
// entre dois números é a distância em dias de calendário.
export function numeroDoDia(instante: Date, fuso: string): number {
  const { ano, mes, dia } = componentesNoFuso(instante, fuso);
  return Math.round(Date.UTC(ano, mes - 1, dia) / 86_400_000);
}

// Instante de 00:00 local do dia de número `numero`.
export function inicioDoDiaPorNumero(numero: number, fuso: string): Date {
  const base = new Date(numero * 86_400_000);
  return instanteDeComponentes(
    {
      ano: base.getUTCFullYear(),
      mes: base.getUTCMonth() + 1,
      dia: base.getUTCDate(),
      hora: 0,
    },
    fuso
  );
}

// "YYYY-MM-DD" do dia calendário no fuso — chave estável de agrupamento,
// nunca instante.toISOString().slice(0,10) (que é o dia UTC).
export function chaveDoDia(instante: Date, fuso: string): string {
  const { ano, mes, dia } = componentesNoFuso(instante, fuso);
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// Início do MÊS calendário, com deslocamento opcional em meses. Mesma
// técnica de intervaloDoDiaDeslocado: a aritmética acontece no campo
// `mes` e Date.UTC normaliza a virada de ano. "Três meses atrás" é três
// meses de calendário, nunca 90 dias.
export function inicioDoMesNoFuso(instante: Date, fuso: string, deslocamentoMeses = 0): Date {
  const { ano, mes } = componentesNoFuso(instante, fuso);
  return instanteDeComponentes({ ano, mes: mes + deslocamentoMeses, dia: 1, hora: 0 }, fuso);
}

// "YYYY-MM" do mês calendário no fuso — chave de agrupamento mensal.
export function chaveDoMes(instante: Date, fuso: string): string {
  const { ano, mes } = componentesNoFuso(instante, fuso);
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}`;
}

export function mesmoDia(a: Date, b: Date, fuso: string): boolean {
  return numeroDoDia(a, fuso) === numeroDoDia(b, fuso);
}

// -----------------------------------------------------------------------
// Formatação (exibição)
// -----------------------------------------------------------------------
// LOCALE ≠ FUSO. O locale continua pt-BR (padrão do produto, inalterado
// nesta fase); o fuso decide QUAL instante aparece. Passar timeZone
// explícito também é o que evita o mismatch de hidratação: o servidor e o
// navegador formatam com o mesmo fuso da organização, em vez de o
// servidor usar UTC e o cliente re-renderizar no fuso de quem olha.

const LOCALE = "pt-BR";

function comoData(valor: Date | string): Date {
  return valor instanceof Date ? valor : new Date(valor);
}

export function formatarDataHoraNoFuso(valor: Date | string, fuso: string): string {
  return comoData(valor).toLocaleString(LOCALE, {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarDataNoFuso(valor: Date | string, fuso: string): string {
  return comoData(valor).toLocaleDateString(LOCALE, {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatarHoraNoFuso(valor: Date | string, fuso: string): string {
  return comoData(valor).toLocaleString(LOCALE, {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarDiaMesNoFuso(valor: Date | string, fuso: string): string {
  return comoData(valor).toLocaleDateString(LOCALE, {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
  });
}

// -----------------------------------------------------------------------
// <input type="datetime-local"> — a fronteira mais perigosa
// -----------------------------------------------------------------------
// datetime-local NÃO carrega fuso: "2026-09-07T14:30" é só um horário de
// parede. Antes desta fase o produto o interpretava como UTC literal, o
// que fazia 14:30 digitado virar 11:30 para quem opera em São Paulo. A
// resposta correta para "14:30 em qual fuso?" agora é: no fuso da
// ORGANIZAÇÃO — nunca no do processo Node, nunca no do navegador de quem
// preencheu o formulário.

const FORMA_DATETIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function deDatetimeLocalNoFuso(valor: string, fuso: string): Date | null {
  const m = FORMA_DATETIME_LOCAL.exec(valor);
  if (!m) return null;
  const [ano, mes, dia, hora, minuto] = m.slice(1).map(Number);
  // Rejeita data que não existe no calendário ("2026-02-30"): sem esta
  // checagem Date.UTC rolaria para 02/03 e gravaria um instante que o
  // usuário nunca pediu. Mesma defesa de parseDataCalendario.
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return null;
  const instante = instanteDeComponentes({ ano, mes, dia, hora, minuto }, fuso);
  const c = componentesNoFuso(instante, fuso);
  // A ida-e-volta confirma o dia. A HORA pode legitimamente divergir (num
  // horário inexistente de início de DST), então só a data é conferida.
  if (c.ano !== ano || c.mes !== mes || c.dia !== dia) return null;
  return instante;
}

// Instante -> "YYYY-MM-DDTHH:mm" no fuso da organização, para preencher o
// campo de edição. Sem isso, remarcar uma visita mostraria o horário em
// UTC e o corretor "corrigiria" um horário que estava certo.
export function paraDatetimeLocalNoFuso(valor: Date | string, fuso: string): string {
  const c = componentesNoFuso(comoData(valor), fuso);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${String(c.ano).padStart(4, "0")}-${p2(c.mes)}-${p2(c.dia)}T${p2(c.hora)}:${p2(c.minuto)}`;
}

// -----------------------------------------------------------------------
// <input type="date"> — filtro de período (só data, sem horário)
// -----------------------------------------------------------------------
// Campo DATE-ONLY do formulário: não é um instante e não deve ser tratado
// como um. O que se guarda é a tripla ano/mês/dia; quem consulta converte
// para intervalo com intervaloDoDiaCalendario.

const FORMA_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDataCalendario(valor: string): DataCalendario | null {
  const m = FORMA_DATA.exec(valor);
  if (!m) return null;
  const [ano, mes, dia] = m.slice(1).map(Number);
  // Data inexistente no calendário nunca vira filtro "válido" porém
  // enganoso — mesma decisão do parseDataUTC que este helper substitui.
  const conferencia = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    conferencia.getUTCFullYear() !== ano ||
    conferencia.getUTCMonth() !== mes - 1 ||
    conferencia.getUTCDate() !== dia
  ) {
    return null;
  }
  return { ano, mes, dia };
}

export function intervaloDaDataCalendario(data: DataCalendario, fuso: string): IntervaloDia {
  return limitesDoDiaCalendario(data, fuso);
}

// -----------------------------------------------------------------------
// Rótulo humano de um fuso
// -----------------------------------------------------------------------
// "America/Sao_Paulo" -> "São Paulo (UTC−03:00)". Ninguém deveria precisar
// ler um identificador IANA para saber o que escolheu — mas é o
// identificador que fica persistido, nunca o rótulo nem o offset.
//
// O offset é sempre calculado PARA UM INSTANTE (padrão: agora), porque em
// fuso com DST ele muda ao longo do ano: Nova York é UTC−05:00 em janeiro
// e UTC−04:00 em julho. Por isso o rótulo é de apresentação, jamais um
// valor que se guarde.

// Cidade a partir do identificador: "America/Sao_Paulo" -> "São Paulo".
// Sem tabela de tradução (seriam centenas de linhas a envelhecer a cada
// atualização de tzdata) — só a última seção do caminho, legível.
const ACENTOS_CIDADE: Readonly<Record<string, string>> = {
  Sao_Paulo: "São Paulo",
  Cuiaba: "Cuiabá",
  Belem: "Belém",
  Maceio: "Maceió",
  Eirunepe: "Eirunepé",
  Araguaina: "Araguaína",
  Sao_Tome: "São Tomé",
  Asuncion: "Asunción",
  Curacao: "Curaçao",
};

export function cidadeDoFuso(fuso: string): string {
  if (fuso === "UTC") return "UTC";
  const ultima = fuso.split("/").pop() ?? fuso;
  return ACENTOS_CIDADE[ultima] ?? ultima.replace(/_/g, " ");
}

// Offset no formato "UTC−03:00" (sinal tipográfico U+2212, como o resto
// do produto escreve número negativo). "UTC" exato para offset zero.
export function offsetDoFuso(fuso: string, referencia: Date = new Date()): string {
  const minutos = Math.round(deslocamentoMs(referencia, fuso) / 60000);
  if (minutos === 0) return "UTC";
  const sinal = minutos < 0 ? "−" : "+";
  const abs = Math.abs(minutos);
  return `UTC${sinal}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export function rotuloFuso(fuso: string, referencia: Date = new Date()): string {
  const cidade = cidadeDoFuso(fuso);
  const offset = offsetDoFuso(fuso, referencia);
  return cidade === offset ? cidade : `${cidade} (${offset})`;
}
