// =======================================================================
// Teto de heap do servidor Next da suíte E2E
// =======================================================================
// POR QUE ISTO EXISTE — um problema real, medido duas vezes:
//
// O teto local era 6144 MB, escolhido numa máquina de 16 GB para impedir
// que o COMPILADOR do `next dev` esbarrasse no padrão do Node (~2 GB) e
// o servidor se reiniciasse no meio da suíte. Numa máquina de 8 GB esse
// mesmo número é veneno: o Next deixa o compilador crescer rumo a 6 GB
// que a máquina não tem, tudo vai para swap, e ele reinicia assim mesmo.
// Observado nesta máquina: 3 reinícios ("Server is approaching the used
// memory threshold, restarting..."), 12 testes derrubados em specs sem
// relação entre si, e a suíte passando de 6 para 23 minutos.
//
// A correção de verdade não é o número: é servir o BUILD (`next start`)
// em vez de compilar sob demanda — a mesma correção que o CI já fez na
// Fase 12, pelo mesmo diagnóstico. Sem compilador, o servidor não cresce.
//
// MEDIÇÃO (esta máquina, 8 GB, suíte inteira em `next start`, 598 testes,
// pico de RSS somado por classe):
//
//   next-server        636 MB   <- o processo que este teto limita
//   chromium           540 MB
//   playwright         359 MB
//   postgres + docker  256 MB
//   livre mínimo      1454 MB
//
// Ou seja: o servidor usa 636 MB. 6144 era 10x o necessário, e mesmo
// 3072 é rede de segurança, não remédio. Por isso o local passa a usar o
// MESMO valor do CI — a divergência 8 GB/16 GB deixa de existir.

/** Valor do CI, preservado exatamente como estava. */
export const TETO_CI_MB = 3072;

/**
 * Quanto o resto do harness consome fora do servidor Next, medido acima:
 * chromium (540) + playwright (359) + postgres/docker (256) = 1155,
 * arredondado para cima. É o que precisa sobrar DEPOIS do teto do Node.
 */
export const RESERVA_HARNESS_MB = 1200;

/**
 * Abaixo disto o teto não é "apertado", é inviável: o próprio servidor
 * de produção mediu 636 MB de pico, e um teto perto disso levaria o Next
 * a reiniciar no meio da suíte — o defeito que esta fase remove.
 */
export const TETO_MINIMO_MB = 1024;

export class MemoriaInsuficienteParaE2E extends Error {}

/**
 * Teto de heap (MB) para o processo do servidor Next da suíte E2E.
 *
 * Ele é aplicado SÓ a esse processo (webServer.env do Playwright), nunca
 * ao Playwright nem ao browser — que têm suas próprias necessidades e
 * entram na reserva acima.
 *
 * Regras, nesta ordem:
 *
 * 1. `override` explícito vence tudo — é a saída para uma máquina
 *    incomum, sem precisar editar código.
 * 2. CI usa o valor de sempre, intocado.
 * 3. Local usa o mesmo valor do CI, desde que a máquina comporte ele
 *    MAIS a reserva do harness.
 * 4. Máquina menor recebe um teto menor, e não um número que ela não
 *    tem — o objetivo é nunca prometer ao Node memória que só existe em
 *    swap.
 * 5. Máquina pequena demais falha ALTO, com mensagem, em vez de entregar
 *    vinte minutos de flake aleatório.
 */
export function tetoDeHeapMB(entrada: {
  ramTotalMB: number;
  ci: boolean;
  override?: string | number | null;
}): number {
  const override = interpretarOverride(entrada.override);
  if (override) return override;

  if (entrada.ci) return TETO_CI_MB;

  const disponivel = Math.floor(entrada.ramTotalMB) - RESERVA_HARNESS_MB;

  if (disponivel < TETO_MINIMO_MB) {
    throw new MemoriaInsuficienteParaE2E(
      `Memória insuficiente para a suíte E2E: a máquina tem ${Math.floor(entrada.ramTotalMB)} MB ` +
        `e o harness (browser, Playwright e Postgres) já reserva ${RESERVA_HARNESS_MB} MB, ` +
        `sobrando ${disponivel} MB para o servidor Next — abaixo do mínimo de ${TETO_MINIMO_MB} MB. ` +
        `Rode specs isolados (npm run test:e2e:dev -- <spec>) ou defina E2E_HEAP_MB para assumir o risco.`
    );
  }

  return Math.min(TETO_CI_MB, disponivel);
}

function interpretarOverride(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  // Lixo na variável de ambiente não pode virar um teto silencioso: ou é
  // um inteiro positivo, ou é como se não tivesse sido definida.
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** `--max-old-space-size=<teto>`, pronto para NODE_OPTIONS. */
export function nodeOptionsDeHeap(teto: number): string {
  return `--max-old-space-size=${teto}`;
}
