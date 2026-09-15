import { describe, test, expect } from "vitest";
import {
  RESULTADOS_VISITA,
  RESULTADO_VISITA_LABEL,
  RESULTADO_VISITA_AJUDA,
  ehResultadoVisita,
  desfechoDaVisita,
  rotuloResultadoRegistrado,
  interpretarObservacaoResultado,
  LIMITE_OBSERVACAO_RESULTADO,
} from "@/lib/resultado-visita";

// Fase 37 — a tradução entre o que o corretor escolhe e os dois fatos que
// o banco guarda. É pura de propósito: a action só aplica o que estas
// funções devolvem, então a regra é testável sem banco e não tem como
// divergir entre superfícies.

describe("vocabulário", () => {
  test("é pequeno e cada valor tem rótulo e explicação", () => {
    expect(RESULTADOS_VISITA).toHaveLength(4);
    for (const r of RESULTADOS_VISITA) {
      expect(RESULTADO_VISITA_LABEL[r]).toBeTruthy();
      expect(RESULTADO_VISITA_AJUDA[r]).toBeTruthy();
    }
  });

  test("recusa valor que não pertence ao vocabulário", () => {
    for (const r of RESULTADOS_VISITA) expect(ehResultadoVisita(r)).toBe(true);
    // Em particular: nada que venha de OUTRO domínio passa. CANCELLED é
    // status, REJECTED é stage, e nenhum dos dois é resultado de visita.
    for (const invalido of ["CANCELLED", "REJECTED", "WON", "", null, undefined, 1, {}]) {
      expect(ehResultadoVisita(invalido)).toBe(false);
    }
  });
});

describe("desfechoDaVisita", () => {
  test.each(["INTERESTED", "UNDECIDED", "NOT_INTERESTED"] as const)(
    "%s: a visita ACONTECEU — status COMPLETED e resultado gravado",
    (resultado) => {
      const d = desfechoDaVisita(resultado);
      expect(d.status).toBe("COMPLETED");
      expect(d.visitOutcome).toBe(resultado);
      expect(d.houveVisita).toBe(true);
    }
  );

  test("NÃO COMPARECEU vira STATUS, nunca resultado comercial", () => {
    const d = desfechoDaVisita("NAO_COMPARECEU");
    expect(d.status).toBe("NO_SHOW");
    // null porque não há o que opinar sobre um imóvel que ninguém viu.
    expect(d.visitOutcome).toBeNull();
    // E é este flag que impede a Interaction VISIT falsa.
    expect(d.houveVisita).toBe(false);
  });

  test("no-show NÃO é cancelamento: o status é próprio", () => {
    expect(desfechoDaVisita("NAO_COMPARECEU").status).not.toBe("CANCELLED");
  });

  test("resultado negativo não produz nada parecido com LOST", () => {
    const d = desfechoDaVisita("NOT_INTERESTED");
    // A visita aconteceu — ela só terminou sem interesse NAQUELE imóvel.
    expect(d.houveVisita).toBe(true);
    expect(d.status).toBe("COMPLETED");
    expect(JSON.stringify(d)).not.toContain("REJECTED");
  });
});

describe("rotuloResultadoRegistrado", () => {
  test("visita encerrada mostra o que foi registrado", () => {
    expect(rotuloResultadoRegistrado("COMPLETED", "INTERESTED")).toBe(
      RESULTADO_VISITA_LABEL.INTERESTED
    );
    expect(rotuloResultadoRegistrado("NO_SHOW", null)).toBe(
      RESULTADO_VISITA_LABEL.NAO_COMPARECEU
    );
  });

  test("visita HISTÓRICA declara a ausência em vez de inventar um resultado", () => {
    // COMPLETED sem outcome é toda visita anterior a esta fase. Nenhum
    // backfill: não se infere "gostou" porque virou proposta.
    expect(rotuloResultadoRegistrado("COMPLETED", null)).toBe("Resultado não registrado");
  });

  test("visita aberta ou cancelada não tem resultado a mostrar", () => {
    expect(rotuloResultadoRegistrado("SCHEDULED", null)).toBeNull();
    expect(rotuloResultadoRegistrado("CANCELLED", null)).toBeNull();
  });
});

describe("observação do resultado", () => {
  test("é opcional: vazio vira null, nunca string vazia", () => {
    for (const vazio of [null, undefined, "", "   "]) {
      const r = interpretarObservacaoResultado(vazio);
      expect(r).toEqual({ ok: true, texto: null });
    }
  });

  test("texto é preservado sem espaços nas pontas", () => {
    expect(interpretarObservacaoResultado("  achou pequeno  ")).toEqual({
      ok: true,
      texto: "achou pequeno",
    });
  });

  test("acima do teto é recusado", () => {
    const r = interpretarObservacaoResultado("x".repeat(LIMITE_OBSERVACAO_RESULTADO + 1));
    expect(r.ok).toBe(false);
  });

  test("exatamente no teto passa", () => {
    expect(interpretarObservacaoResultado("x".repeat(LIMITE_OBSERVACAO_RESULTADO)).ok).toBe(true);
  });

  test("tipo inválido é recusado", () => {
    expect(interpretarObservacaoResultado(42).ok).toBe(false);
  });
});
