import { describe, expect, test } from "vitest";
import { urlOgImagemDoImovel } from "@/lib/compartilhar-imovel";

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
