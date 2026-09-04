import { describe, expect, test } from "vitest";
import { digitosWhatsApp, linkWhatsApp, temWhatsApp } from "./whatsapp";

describe("digitosWhatsApp", () => {
  test("mantém só os dígitos de um número formatado", () => {
    expect(digitosWhatsApp("+55 (11) 98888-7777")).toBe("5511988887777");
  });

  test("devolve string vazia pra ausência de número", () => {
    expect(digitosWhatsApp(null)).toBe("");
    expect(digitosWhatsApp(undefined)).toBe("");
    expect(digitosWhatsApp("")).toBe("");
  });

  test("devolve string vazia pra texto sem dígito nenhum", () => {
    expect(digitosWhatsApp("fale conosco")).toBe("");
  });

  test("não explode com tipo errado vindo de dado não confiável", () => {
    expect(digitosWhatsApp(42 as unknown as string)).toBe("");
  });
});

describe("temWhatsApp", () => {
  test("aceita número completo", () => {
    expect(temWhatsApp("11988887777")).toBe(true);
  });

  test("recusa número incompleto — mandar isso pro wa.me abre erro, não conversa", () => {
    expect(temWhatsApp("1198")).toBe(false);
    expect(temWhatsApp("")).toBe(false);
    expect(temWhatsApp(null)).toBe(false);
  });
});

describe("linkWhatsApp", () => {
  test("monta a URL só com os dígitos", () => {
    expect(linkWhatsApp("(11) 98888-7777")).toBe("https://wa.me/11988887777");
  });

  test("codifica a mensagem no parâmetro text", () => {
    const url = linkWhatsApp("11988887777", "Olá! Tudo bem?");
    expect(url).toBe("https://wa.me/11988887777?text=Ol%C3%A1!%20Tudo%20bem%3F");
  });

  test("devolve null sem número utilizável — quem chama não renderiza CTA", () => {
    expect(linkWhatsApp(null)).toBeNull();
    expect(linkWhatsApp("")).toBeNull();
    expect(linkWhatsApp("123")).toBeNull();
  });

  test("nunca devolve link com número do produto embutido", () => {
    expect(linkWhatsApp(null, "mensagem qualquer")).toBeNull();
  });
});
