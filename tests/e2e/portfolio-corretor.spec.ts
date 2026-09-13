import { test, expect, type Page } from "@playwright/test";
import {
  HOSTNAME_E2E_ORG_B,
  IDS_E2E,
  ORG_A,
  ORG_B,
  ORG_PORTFOLIO,
  despublicarPerfisNoBanco,
  publicarPerfilPorEmailNoBanco,
  publicarPerfisNoBanco,
} from "./helpers";

// =======================================================================
// Portfólio público do corretor — a faceta "?corretor=" da listagem
// =======================================================================
// "Imóveis deste corretor" é um FILTRO da listagem pública, não uma
// segunda listagem: mesma página, mesma query, mesma paginação, mesma
// ordenação. Estes testes provam as duas metades disso — que o recorte
// funciona e que ele não afrouxa nenhuma das barreiras que já existiam
// (tenant, status público, opt-in de publicação).
//
// O elenco vem da Organização P do seed (ver prisma/seed-e2e.ts):
//   Paula — 8 AVAILABLE + 1 SOLD   Rui — 2   Sônia — 1, nunca publicada
//   + 1 imóvel sem responsável.    Total público da organização: 12.
const BASE = `/${ORG_PORTFOLIO.slug}`;
const LISTAGEM = `${BASE}/imoveis`;
const PAULA = IDS_E2E.membroPortfolioPaula;
const RUI = IDS_E2E.membroPortfolioRui;
const SONIA = IDS_E2E.membroPortfolioSonia;

const IMOVEIS_DA_PAULA = 8;
const IMOVEIS_PUBLICOS_DA_ORG = 12;

// Um card = um <a href=".../imoveis/{id}">. A trilha e a paginação
// apontam para "/imoveis" sem barra final, então não entram na conta.
function cards(page: Page) {
  return page.locator('a[href*="/imoveis/"]');
}

// Publicação é fixture aqui, não é o comportamento sob teste — quem
// prova que o PAINEL publica é perfil-corretor.spec.ts, pela interface.
// Escrever direto no banco não depende de navegador vivo, que é o que
// torna a restauração confiável mesmo quando um teste estoura (ver o
// cabeçalho de scripts/e2e-perfil-publico.ts).
test.beforeAll(() => {
  publicarPerfisNoBanco(PAULA, RUI);
});

test.afterAll(() => {
  despublicarPerfisNoBanco(ORG_PORTFOLIO.slug);
});

test.describe("perfil do corretor — a saída para o portfólio completo", () => {
  test("com mais imóveis do que a vitrine mostra, o CTA leva à listagem filtrada", async ({
    page,
  }) => {
    await page.goto(`${BASE}/corretores/${PAULA}`);

    // Vitrine: seis, não os oito — o perfil continua vitrine.
    await expect(cards(page)).toHaveCount(6);

    const cta = page.getByRole("link", { name: "Ver todos os imóveis" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", `${LISTAGEM}?corretor=${PAULA}`);
  });

  test("com tudo já visível, nenhum CTA redundante", async ({ page }) => {
    await page.goto(`${BASE}/corretores/${RUI}`);
    await expect(cards(page)).toHaveCount(2);
    // Os dois imóveis do Rui já estão na tela: "ver todos" não levaria a
    // nada novo.
    await expect(page.getByRole("link", { name: "Ver todos os imóveis" })).toHaveCount(0);
  });

  test("clicar no CTA abre a listagem já filtrada, com o contexto visível", async ({ page }) => {
    await page.goto(`${BASE}/corretores/${PAULA}`);
    await page.getByRole("link", { name: "Ver todos os imóveis" }).click();
    await page.waitForURL(new RegExp(`corretor=${PAULA}`));

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Imóveis de Paula");
    await expect(page.getByText(`${IMOVEIS_DA_PAULA} imóveis encontrados`)).toBeVisible();
    await expect(page.locator("[data-filtro-corretor]")).toContainText("Corretor: Paula");
    await expect(cards(page)).toHaveCount(IMOVEIS_DA_PAULA);
  });

  test("o CTA é link semântico e alcançável pelo teclado", async ({ page }) => {
    await page.goto(`${BASE}/corretores/${PAULA}`);
    const cta = page.getByRole("link", { name: "Ver todos os imóveis" });
    await cta.focus();
    await expect(cta).toBeFocused();
    await cta.press("Enter");
    await page.waitForURL(new RegExp(`corretor=${PAULA}`));
    await expect(cards(page)).toHaveCount(IMOVEIS_DA_PAULA);
  });
});

test.describe("a listagem filtrada mostra o recorte certo", () => {
  test("só os imóveis daquele corretor — de mais ninguém, e nada fora do critério público", async ({
    page,
  }) => {
    await page.goto(`${LISTAGEM}?corretor=${PAULA}`);
    await expect(cards(page)).toHaveCount(IMOVEIS_DA_PAULA);

    const html = await page.content();
    // Carteira de outro corretor da MESMA organização.
    expect(html).not.toContain("Imóvel 1 do Rui");
    expect(html).not.toContain("Imóvel da Sônia");
    // Imóvel sem responsável não pertence a corretor nenhum.
    expect(html).not.toContain("Imóvel sem responsável");
    // SOLD continua fora: a faceta não afrouxa o status público.
    expect(html).not.toContain("Imóvel vendido da Paula");
  });

  test("sem o filtro, a listagem continua sendo a de sempre", async ({ page }) => {
    await page.goto(LISTAGEM);
    await expect(cards(page)).toHaveCount(IMOVEIS_PUBLICOS_DA_ORG);
    await expect(page.locator("[data-filtro-corretor]")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Resultados da busca");
  });

  test("nenhum dado privado do profissional chega ao HTML", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=${PAULA}`);
    const html = await page.content();
    // A listagem mostra o NOME e nada mais: e-mail de login, campos
    // internos e papéis não são buscados, então não têm por onde vazar.
    expect(html).not.toContain(ORG_PORTFOLIO.email);
    for (const proibido of ["publicProfileEnabled", "contactEmail", "OWNER", "organizationId"]) {
      expect(html, `"${proibido}" não pode aparecer`).not.toContain(proibido);
    }
  });
});

// A faceta NÃO inventa política de SEO própria: ela herda a que a
// listagem já tinha para lançamento/destaque/oportunidade e para toda
// combinação de filtros — canonical para a URL base, e nenhuma URL
// facetada no sitemap. A página indexável do profissional continua sendo
// o perfil dele, que já entra no sitemap quando publicado.
test.describe("SEO da faceta", () => {
  test("canonical aponta para a listagem, sem o filtro", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=${PAULA}&bairro=Jardins`);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toContain(LISTAGEM);
    expect(canonical).not.toContain("corretor");
    expect(canonical).not.toContain("bairro");
  });

  test("o sitemap não ganhou nenhuma URL facetada", async ({ request }) => {
    // O sitemap é por HOST, então quem responde em /sitemap.xml é a
    // organização principal: é lá que o corretor precisa estar
    // publicado para a comparação significar alguma coisa.
    try {
      const membroA = publicarPerfilPorEmailNoBanco(ORG_A.slug, ORG_A.email);
      const resposta = await request.get("/sitemap.xml");
      expect(resposta.status()).toBe(200);
      const corpo = await resposta.text();

      // O PERFIL publicado entra — é a página indexável do
      // profissional, e já entrava antes desta fase.
      expect(corpo).toContain(`/corretores/${membroA}`);
      // A faceta NÃO entra: nenhuma combinação ?corretor= vira URL de
      // sitemap, pela mesma razão que ?bairro= nunca virou.
      expect(corpo).not.toContain("corretor=");
    } finally {
      despublicarPerfisNoBanco(ORG_A.slug);
    }
  });
});

test.describe("remover o filtro", () => {
  test("o × tira só o corretor e devolve a listagem inteira", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=${PAULA}`);
    await page.getByRole("link", { name: /Remover filtro do corretor/ }).click();
    await page.waitForURL((url) => !url.search.includes("corretor"));

    await expect(cards(page)).toHaveCount(IMOVEIS_PUBLICOS_DA_ORG);
    await expect(page.locator("[data-filtro-corretor]")).toHaveCount(0);
  });

  test("os demais filtros sobrevivem à remoção", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=${PAULA}&bairro=Jardins`);
    // Interseção: 3 da Paula no Jardins, não os 8 dela nem os 5 do bairro.
    await expect(cards(page)).toHaveCount(3);

    await page.getByRole("link", { name: /Remover filtro do corretor/ }).click();
    await page.waitForURL((url) => !url.search.includes("corretor"));

    // O bairro continua na URL e no resultado: 3 da Paula + 2 do Rui.
    expect(page.url()).toContain("bairro=Jardins");
    await expect(cards(page)).toHaveCount(5);
  });

  test("o nome do corretor leva ao perfil dele", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=${PAULA}`);
    await page.locator("[data-filtro-corretor]").getByRole("link", { name: /Corretor:/ }).click();
    await page.waitForURL(new RegExp(`/corretores/${PAULA}`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Paula");
  });

  test("o botão de remover tem nome acessível e é alcançável pelo teclado", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=${PAULA}`);
    const remover = page.getByRole("link", { name: "Remover filtro do corretor Paula Portfolio" });
    await expect(remover).toBeVisible();
    await remover.focus();
    await expect(remover).toBeFocused();
  });
});

test.describe("combinação com os outros filtros", () => {
  test("corretor + bairro é interseção", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=${PAULA}&bairro=Jardins`);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.locator("[data-filtro-corretor]")).toBeVisible();
  });

  test("corretor + tipo é interseção", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=${PAULA}&tipo=Casa`);
    await expect(cards(page)).toHaveCount(3);
  });

  test("corretor + finalidade continua respeitando o corretor", async ({ page }) => {
    // Todos os imóveis do seed desta organização são de venda: o filtro
    // de finalidade não muda o recorte, mas também não pode apagá-lo.
    await page.goto(`${LISTAGEM}?corretor=${PAULA}&finalidade=SALE`);
    await expect(cards(page)).toHaveCount(IMOVEIS_DA_PAULA);
    await page.goto(`${LISTAGEM}?corretor=${PAULA}&finalidade=RENT`);
    await expect(cards(page)).toHaveCount(0);
    // Zero resultados por causa da finalidade não é "corretor
    // indisponível": o contexto do corretor continua na tela.
    await expect(page.locator("[data-filtro-corretor]")).toBeVisible();
  });

  test("aplicar um filtro pela barra não apaga o corretor", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=${PAULA}`);
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.waitForURL(new RegExp(`corretor=${PAULA}`));
    await expect(cards(page)).toHaveCount(IMOVEIS_DA_PAULA);
  });

  test("a paginação preserva o corretor", async ({ page }) => {
    // pageSize é parâmetro da listagem de sempre — com 4 por página, os
    // 8 imóveis da Paula ocupam duas.
    await page.goto(`${LISTAGEM}?corretor=${PAULA}&pageSize=4`);
    await expect(cards(page)).toHaveCount(4);

    await page.getByRole("link", { name: "Próxima" }).click();
    await page.waitForURL(/page=2/);
    expect(page.url()).toContain(`corretor=${PAULA}`);
    await expect(cards(page)).toHaveCount(4);
    await expect(page.locator("[data-filtro-corretor]")).toBeVisible();
    // A segunda página é do MESMO recorte: nada do Rui aparece nela.
    expect(await page.content()).not.toContain("Imóvel 1 do Rui");
  });

  test("a ordenação preserva o corretor", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=${PAULA}`);
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Menor valor" }).click();
    await page.waitForURL(/ordenar=menor_valor/);

    expect(page.url()).toContain(`corretor=${PAULA}`);
    await expect(cards(page)).toHaveCount(IMOVEIS_DA_PAULA);
    await expect(page.locator("[data-filtro-corretor]")).toBeVisible();
  });
});

test.describe("filtro que não pode representar ninguém", () => {
  // A mensagem é a MESMA nos três casos abaixo — id inventado, id de
  // outro tenant e perfil sem opt-in. Ela não confirma se aquele id
  // existe em lugar nenhum.
  const MENSAGEM = "Este corretor não está mais disponível no site.";

  test("id inexistente: zero imóveis, nunca o catálogo inteiro", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=cmzzzzzzzzzzzzzzzzzzzzzzz`);
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByText(MENSAGEM)).toBeVisible();
    await expect(page.locator("[data-filtro-corretor]")).toHaveCount(0);
  });

  test("a saída do beco: um link que remove o filtro e devolve a listagem", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=cmzzzzzzzzzzzzzzzzzzzzzzz`);
    await page.getByRole("link", { name: "Ver imóveis sem este filtro" }).click();
    await page.waitForURL((url) => !url.search.includes("corretor"));
    await expect(cards(page)).toHaveCount(IMOVEIS_PUBLICOS_DA_ORG);
  });

  test("corretor sem opt-in não é filtrável, e a carteira dele não aparece", async ({ page }) => {
    await page.goto(`${LISTAGEM}?corretor=${SONIA}`);
    await expect(cards(page)).toHaveCount(0);
    const html = await page.content();
    expect(html).toContain(MENSAGEM);
    // Nem o imóvel dela, nem o nome dela: sem publicação não há
    // associação pública nenhuma.
    expect(html).not.toContain("Imóvel da Sônia");
    expect(html).not.toContain("Sônia");
  });

  test("despublicar corta a associação de uma URL já compartilhada", async ({ page }) => {
    try {
      await page.goto(`${LISTAGEM}?corretor=${RUI}`);
      await expect(cards(page)).toHaveCount(2);
      await expect(page.locator("[data-filtro-corretor]")).toContainText("Rui");

      // O profissional desiste de aparecer no site. A URL continua nas
      // conversas de quem a recebeu.
      despublicarPerfisNoBanco(ORG_PORTFOLIO.slug);

      await page.goto(`${LISTAGEM}?corretor=${RUI}`);
      const html = await page.content();
      expect(html).toContain(MENSAGEM);
      // O nome dele não é mais publicado, e os imóveis deixam de ser
      // apresentados COMO DELE — o que a organização anuncia
      // institucionalmente continua na listagem sem filtro.
      expect(html).not.toContain("Rui Portfolio");
      await expect(cards(page)).toHaveCount(0);

      // E o perfil, pela mesma regra, deixa de existir.
      const resposta = await page.goto(`${BASE}/corretores/${RUI}`);
      expect(resposta?.status()).toBe(404);
    } finally {
      publicarPerfisNoBanco(PAULA, RUI);
    }
  });
});

test.describe("isolamento entre organizações", () => {
  test("id de corretor de outro tenant não traz os imóveis dele", async ({ page }) => {
    // Paula está publicada — só que na Organização P.
    await page.goto(`/${ORG_B.slug}/imoveis?corretor=${PAULA}`);
    await expect(cards(page)).toHaveCount(0);
    const html = await page.content();
    expect(html).not.toContain("Imóvel 1 da Paula");
    expect(html).not.toContain("Paula Portfolio");
  });

  test("na organização principal, um id de outro tenant também não resolve", async ({ page }) => {
    await page.goto(`/imoveis?corretor=${PAULA}`);
    const html = await page.content();
    expect(html).not.toContain("Imóvel 1 da Paula");
    expect(html).not.toContain("Paula Portfolio");
    await expect(page.getByText("Este corretor não está mais disponível no site.")).toBeVisible();
  });

  test("a organização principal tem a faceta própria funcionando", async ({ page }) => {
    // Publicar aqui é estado GLOBAL do tenant (Org A é compartilhada por
    // vários specs), então a restauração é imediata e por banco.
    try {
      const membroA = publicarPerfilPorEmailNoBanco(ORG_A.slug, ORG_A.email);
      await page.goto(`/imoveis?corretor=${membroA}`);
      await expect(page.locator("[data-filtro-corretor]")).toBeVisible();

      // Nada de contagem absoluta aqui: a Org A é a organização de
      // trabalho de vários specs, que criam imóveis e atribuem
      // responsáveis — um número fixo seria refém da ordem de execução.
      // A asserção é sobre PERTENCIMENTO, que é o que a faceta promete:
      // o imóvel cujo responsável É este membro aparece; o que não tem
      // responsável nenhum, não.
      await expect(
        page.locator(`a[href$="/imoveis/${IDS_E2E.imovelComBadgesOrgA}"]`)
      ).toBeVisible();
      await expect(
        page.locator(`a[href$="/imoveis/${IDS_E2E.imovelAluguelOrgA}"]`)
      ).toHaveCount(0);
    } finally {
      despublicarPerfisNoBanco(ORG_A.slug);
    }
  });

  test("sob domínio customizado, a querystring do filtro chega inteira", async ({ request }) => {
    try {
      publicarPerfisNoBanco(IDS_E2E.membroOwnerOrgB);
      const resposta = await request.get(`/imoveis?corretor=${IDS_E2E.membroOwnerOrgB}`, {
        headers: { Host: HOSTNAME_E2E_ORG_B },
      });
      expect(resposta.status()).toBe(200);
      const corpo = await resposta.text();
      expect(corpo).toContain("Imóvel da Organização B");
      expect(corpo).toContain("data-filtro-corretor");
    } finally {
      despublicarPerfisNoBanco(ORG_B.slug);
    }
  });
});

test.describe("responsivo", () => {
  for (const largura of [320, 390, 768, 1280, 1440]) {
    test(`${largura}px: contexto do filtro legível, sem overflow e com alvo de toque`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(`${LISTAGEM}?corretor=${PAULA}&bairro=Jardins&tipo=Casa`);

      const medida = await page.evaluate(() => {
        const chip = document.querySelector("[data-filtro-corretor]")!;
        const remover = chip.querySelector('a[aria-label^="Remover"]')!.getBoundingClientRect();
        const caixa = chip.getBoundingClientRect();
        return {
          visivel: caixa.height > 0,
          alvoRemover: Math.min(remover.width, remover.height),
          removerDentro: remover.right <= caixa.right + 1,
          semOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
          tituloVisivel: document.querySelector("h1")!.getBoundingClientRect().height > 0,
        };
      });

      expect(medida.visivel, `chip @ ${largura}px`).toBe(true);
      expect(medida.tituloVisivel, `título @ ${largura}px`).toBe(true);
      expect(medida.alvoRemover, `alvo do × @ ${largura}px`).toBeGreaterThanOrEqual(24);
      expect(medida.removerDentro, `× fora do chip @ ${largura}px`).toBe(true);
      expect(medida.semOverflow, `overflow @ ${largura}px`).toBe(true);
    });
  }
});
