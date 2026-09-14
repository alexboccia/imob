import { describe, test, expect } from "vitest";
import {
  MemoriaInsuficienteParaE2E,
  nodeOptionsDeHeap,
  RESERVA_HARNESS_MB,
  TETO_CI_MB,
  TETO_MINIMO_MB,
  tetoDeHeapMB,
} from "@/test/heap-e2e";

// As regras, não a RAM de nenhuma máquina real: o valor do runner do
// GitHub muda sem aviso, e um teste que o afirmasse quebraria sozinho.

describe("tetoDeHeapMB — CI", () => {
  test("o CI continua com o valor de sempre, venha a máquina que vier", () => {
    for (const ramTotalMB of [4096, 7168, 16384, 65536]) {
      expect(tetoDeHeapMB({ ramTotalMB, ci: true })).toBe(TETO_CI_MB);
    }
  });

  test("nem uma máquina pequena derruba o CI: lá o valor é fixo, não calculado", () => {
    // A regra de fail-fast é LOCAL. Mudar o comportamento do CI seria
    // exatamente o que esta microfase não pode fazer.
    expect(() => tetoDeHeapMB({ ramTotalMB: 1024, ci: true })).not.toThrow();
    expect(tetoDeHeapMB({ ramTotalMB: 1024, ci: true })).toBe(TETO_CI_MB);
  });
});

describe("tetoDeHeapMB — local", () => {
  test("máquina de 8 GB recebe o mesmo teto do CI", () => {
    // 8192 - 1200 = 6992, acima do teto: fica no valor provado.
    expect(tetoDeHeapMB({ ramTotalMB: 8192, ci: false })).toBe(TETO_CI_MB);
  });

  test("máquina de 16 GB recebe o mesmo teto — sobra não vira teto maior", () => {
    // O objetivo nunca foi o número máximo: o servidor mediu 636 MB de
    // pico servindo o build. Dar 6 GB a quem usa 0,6 GB não acelera nada.
    expect(tetoDeHeapMB({ ramTotalMB: 16384, ci: false })).toBe(TETO_CI_MB);
    expect(tetoDeHeapMB({ ramTotalMB: 65536, ci: false })).toBe(TETO_CI_MB);
  });

  test("máquina menor recebe teto menor, nunca memória que só existe em swap", () => {
    // 4 GB: 4096 - 1200 = 2896.
    expect(tetoDeHeapMB({ ramTotalMB: 4096, ci: false })).toBe(4096 - RESERVA_HARNESS_MB);
    // 3 GB: 3072 - 1200 = 1872.
    expect(tetoDeHeapMB({ ramTotalMB: 3072, ci: false })).toBe(3072 - RESERVA_HARNESS_MB);
  });

  test("o teto nunca passa do valor provado nem fica abaixo do mínimo", () => {
    for (const ramTotalMB of [2224, 3000, 4096, 8192, 32768]) {
      const teto = tetoDeHeapMB({ ramTotalMB, ci: false });
      expect(teto).toBeLessThanOrEqual(TETO_CI_MB);
      expect(teto).toBeGreaterThanOrEqual(TETO_MINIMO_MB);
    }
  });

  test("limite inferior exato: o primeiro tamanho aceito é reserva + mínimo", () => {
    const limite = RESERVA_HARNESS_MB + TETO_MINIMO_MB;
    expect(tetoDeHeapMB({ ramTotalMB: limite, ci: false })).toBe(TETO_MINIMO_MB);
    expect(() => tetoDeHeapMB({ ramTotalMB: limite - 1, ci: false })).toThrow(
      MemoriaInsuficienteParaE2E
    );
  });

  test("máquina pequena demais falha ALTO, com mensagem acionável", () => {
    // Erro claro é melhor que vinte minutos de flake aleatório.
    expect(() => tetoDeHeapMB({ ramTotalMB: 2048, ci: false })).toThrow(
      /Memória insuficiente para a suíte E2E/
    );
    expect(() => tetoDeHeapMB({ ramTotalMB: 2048, ci: false })).toThrow(/E2E_HEAP_MB/);
  });

  test("RAM fracionada é arredondada para baixo, nunca para cima", () => {
    expect(tetoDeHeapMB({ ramTotalMB: 4096.9, ci: false })).toBe(4096 - RESERVA_HARNESS_MB);
  });
});

describe("tetoDeHeapMB — override explícito", () => {
  test("vence o cálculo, inclusive numa máquina que falharia", () => {
    expect(tetoDeHeapMB({ ramTotalMB: 1024, ci: false, override: "1536" })).toBe(1536);
    expect(tetoDeHeapMB({ ramTotalMB: 16384, ci: false, override: 8192 })).toBe(8192);
  });

  test("vence também no CI — é a saída para um runner diferente", () => {
    expect(tetoDeHeapMB({ ramTotalMB: 7168, ci: true, override: "2048" })).toBe(2048);
  });

  test("lixo na variável não vira teto silencioso: cai na regra normal", () => {
    for (const lixo of ["", "  ", "abc", "-1", "0", "2.5", "NaN"]) {
      expect(tetoDeHeapMB({ ramTotalMB: 8192, ci: false, override: lixo })).toBe(TETO_CI_MB);
    }
    expect(tetoDeHeapMB({ ramTotalMB: 8192, ci: false, override: null })).toBe(TETO_CI_MB);
    expect(tetoDeHeapMB({ ramTotalMB: 8192, ci: false, override: undefined })).toBe(TETO_CI_MB);
  });
});

describe("nodeOptionsDeHeap", () => {
  test("monta a flag que o Node entende", () => {
    expect(nodeOptionsDeHeap(3072)).toBe("--max-old-space-size=3072");
  });
});
