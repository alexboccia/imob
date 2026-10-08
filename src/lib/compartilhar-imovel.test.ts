import { describe, expect, test } from "vitest";
import { urlOgImagemDoImovel, urlRastreavelDoImovel } from "@/lib/compartilhar-imovel";

// MKT-005 — a URL de og:image nunca é a URL bruta de Media.url (pode ser
// webp, que o crawler do WhatsApp não renderiza em preview); é sempre a
// rota própria que devolve um JPEG. Estes testes provam só a MONTAGEM da
// URL (determinística, sem I/O) — a conversão em si é testada via E2E
// contra o HTML real da página (og-metadata.spec.ts).
describe("urlOgImagemDoImovel", () => {
  test("monta uma URL absoluta sob o mesmo origin recebido, nunca a URL de Media.url", () => {
    const url = urlOgImagemDoImovel({
      origin: "https://imob-f4vb3.ondigitalocean.app",
      organizationId: "org-123",
      imovelId: "imovel-456",
    });
    expect(url).toBe("https://imob-f4vb3.ondigitalocean.app/api/og-image/org-123/imovel-456");
  });

  test("respeita um domínio customizado recebido como origin (mesma origem do canonical)", () => {
    const url = urlOgImagemDoImovel({
      origin: "https://www.imobiliariaexemplo.com.br",
      organizationId: "org-abc",
      imovelId: "imovel-xyz",
    });
    expect(url).toBe("https://www.imobiliariaexemplo.com.br/api/og-image/org-abc/imovel-xyz");
  });

  test("codifica ids com caracteres especiais, nunca concatena cru na URL", () => {
    const url = urlOgImagemDoImovel({
      origin: "https://exemplo.com",
      organizationId: "org/weird?id",
      imovelId: "imovel&id=1",
    });
    expect(url).toBe("https://exemplo.com/api/og-image/org%2Fweird%3Fid/imovel%26id%3D1");
  });

  test("determinística: mesma entrada produz sempre a mesma URL", () => {
    const entrada = { origin: "https://exemplo.com", organizationId: "a", imovelId: "b" };
    expect(urlOgImagemDoImovel(entrada)).toBe(urlOgImagemDoImovel(entrada));
  });
});

// MKT-006 — link rastreável do Kit de Divulgação: a mesma URL canônica,
// com utm_source/utm_medium para o canal. Nunca cria evento nenhum
// aqui (função pura, sem I/O) — só monta a string que o corretor cola
// no Instagram/Facebook/WhatsApp.
describe("urlRastreavelDoImovel", () => {
  const BASE = "https://imob-f4vb3.ondigitalocean.app/imoveis/imovel-123";

  test("Instagram: acrescenta utm_source=instagram e utm_medium=divulgacao", () => {
    const url = urlRastreavelDoImovel({ url: BASE, canal: "instagram" });
    expect(url).toBe(`${BASE}?utm_source=instagram&utm_medium=divulgacao`);
  });

  test("Facebook: acrescenta utm_source=facebook", () => {
    const url = urlRastreavelDoImovel({ url: BASE, canal: "facebook" });
    expect(new URL(url).searchParams.get("utm_source")).toBe("facebook");
  });

  test("WhatsApp: acrescenta utm_source=whatsapp", () => {
    const url = urlRastreavelDoImovel({ url: BASE, canal: "whatsapp" });
    expect(new URL(url).searchParams.get("utm_source")).toBe("whatsapp");
  });

  test("preserva o resto da URL (path, domínio) intacto", () => {
    const url = urlRastreavelDoImovel({ url: BASE, canal: "instagram" });
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://imob-f4vb3.ondigitalocean.app");
    expect(parsed.pathname).toBe("/imoveis/imovel-123");
  });

  test("nunca modifica/duplica um utm_source já presente na URL de entrada — substitui (set, não append)", () => {
    const comUtmAntigo = `${BASE}?utm_source=campanha-antiga&outro=mantido`;
    const url = urlRastreavelDoImovel({ url: comUtmAntigo, canal: "facebook" });
    const parsed = new URL(url);
    expect(parsed.searchParams.getAll("utm_source")).toEqual(["facebook"]);
    expect(parsed.searchParams.get("outro")).toBe("mantido");
  });

  test("não insere nenhum dado pessoal — só o canal e o literal 'divulgacao'", () => {
    const url = urlRastreavelDoImovel({ url: BASE, canal: "whatsapp" });
    expect(url).not.toMatch(/@|\d{2,3}\.\d{3}\.\d{3}|telefone|email/i);
  });

  test("não modifica a string original recebida (a URL canônica/og:image continua intacta em quem chamou)", () => {
    const original = BASE;
    urlRastreavelDoImovel({ url: original, canal: "instagram" });
    expect(original).toBe(BASE);
  });

  test("determinística: mesma entrada produz sempre a mesma URL", () => {
    const entrada = { url: BASE, canal: "instagram" as const };
    expect(urlRastreavelDoImovel(entrada)).toBe(urlRastreavelDoImovel(entrada));
  });
});
