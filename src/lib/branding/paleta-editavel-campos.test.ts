import { describe, test, expect } from "vitest";
import {
  CHAVES_COR_EDITAVEIS,
  campoCorDaChave,
  ROTULOS_COR_EDITAVEL,
} from "@/lib/branding/paleta-editavel";
import { CATALOGO_TEMAS, TEMA_PADRAO_ID, type TokensTema } from "@/lib/branding/temas";

// Fase 62 — o editor de cores passou a mandar as cores pelo FORMULÁRIO
// único, então os nomes de campo deixaram de ser detalhe do componente e
// passaram a ser um contrato entre o cliente e a Server Action.
describe("campos de cor do formulário de Configurações", () => {
  test("são exatamente as seis cores editáveis, sem `link`", () => {
    expect([...CHAVES_COR_EDITAVEIS]).toEqual([
      "primary",
      "primaryHover",
      "primaryLight",
      "secondary",
      "border",
      "onPrimary",
    ]);
    // `link` é derivado de primary no servidor — nunca um campo de tela.
    expect(CHAVES_COR_EDITAVEIS).not.toContain("link");
  });

  test("toda chave editável existe em TokensTema", () => {
    const tema: TokensTema = CATALOGO_TEMAS[TEMA_PADRAO_ID];
    for (const chave of CHAVES_COR_EDITAVEIS) {
      expect(tema[chave], `token ${chave}`).toBeTruthy();
    }
  });

  test("o nome do campo não colide com nenhum outro campo do formulário", () => {
    // Os campos do formulário de Configurações são nomes "planos"
    // (telefone, whatsapp, themeId...). O prefixo cor_ mantém as cores
    // num espaço próprio — se alguém renomear o prefixo sem atualizar a
    // action, este teste não pega, mas a colisão pega.
    const nomes = CHAVES_COR_EDITAVEIS.map(campoCorDaChave);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const nome of nomes) expect(nome.startsWith("cor_")).toBe(true);
  });

  test("toda cor editável tem rótulo, e nenhum rótulo se repete", () => {
    const rotulos = CHAVES_COR_EDITAVEIS.map((chave) => ROTULOS_COR_EDITAVEL[chave]);
    for (const rotulo of rotulos) expect(rotulo).toBeTruthy();
    // Dois controles com o mesmo rótulo seriam indistinguíveis na tela e
    // para leitor de tela — foi o defeito das caixas Topo/Rodapé na Fase 58.
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });
});
