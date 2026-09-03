import { describe, test, expect, afterEach } from "vitest";
import { abrirContaGotas, contaGotasSuportado } from "@/lib/eyedropper";

// A suíte roda em `environment: "node"` (sem DOM). Como o módulo só toca
// em `window.EyeDropper`, dá pra exercitá-lo por completo stubando o
// próprio global — sem precisar puxar jsdom/happy-dom só por causa
// destes testes.
// Object.defineProperty em vez de atribuição direta: `window` é tipada
// globalmente como a Window real do DOM, e um stub parcial não satisfaz
// esse tipo — isto injeta o global sem precisar de `any`.
function definirJanela(valor: unknown) {
  Object.defineProperty(globalThis, "window", {
    value: valor,
    configurable: true,
    writable: true,
  });
}

function comEyeDropper(open: () => Promise<{ sRGBHex: string }>) {
  definirJanela({ EyeDropper: function () { return { open }; } });
}

function semEyeDropper() {
  definirJanela({});
}

function semJanela() {
  Reflect.deleteProperty(globalThis, "window");
}

afterEach(() => {
  semJanela();
});

describe("contaGotasSuportado", () => {
  test("false durante SSR (sem window)", () => {
    semJanela();
    expect(contaGotasSuportado()).toBe(false);
  });

  test("false quando o navegador não expõe a API", () => {
    semEyeDropper();
    expect(contaGotasSuportado()).toBe(false);
  });

  test("true quando a API existe", () => {
    comEyeDropper(async () => ({ sRGBHex: "#123456" }));
    expect(contaGotasSuportado()).toBe(true);
  });
});

describe("abrirContaGotas", () => {
  test("devolve o hex escolhido pelo usuário", async () => {
    comEyeDropper(async () => ({ sRGBHex: "#123456" }));
    await expect(abrirContaGotas()).resolves.toBe("#123456");
  });

  // Cancelamento (ESC/clique fora) rejeita com AbortError. Não é erro de
  // verdade: precisa virar null silencioso, sem unhandled rejection.
  test("cancelamento vira null, sem lançar", async () => {
    const abort = Object.assign(new Error("The user canceled the selection."), {
      name: "AbortError",
    });
    comEyeDropper(() => Promise.reject(abort));
    await expect(abrirContaGotas()).resolves.toBeNull();
  });

  test("qualquer outra falha também vira null, sem lançar", async () => {
    comEyeDropper(() => Promise.reject(new Error("falha qualquer")));
    await expect(abrirContaGotas()).resolves.toBeNull();
  });

  test("navegador sem suporte devolve null sem tentar abrir", async () => {
    semEyeDropper();
    await expect(abrirContaGotas()).resolves.toBeNull();
  });

  test("SSR (sem window) devolve null sem tentar abrir", async () => {
    semJanela();
    await expect(abrirContaGotas()).resolves.toBeNull();
  });
});
