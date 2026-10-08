import { test, expect } from "@playwright/test";
import { ORG_RECURSOS, ORG_A, IDS_E2E, login } from "./helpers";

// =======================================================================
// Gerador de criativos de marketing — "Criar divulgação" (MKT-001)
// =======================================================================
// Fixtures reaproveitadas do seed (nenhuma nova): imovelGaleria2 (Org
// Recursos) tem 2 fotos REAIS em data: URL — únicas fotos do seed que
// resolvem de verdade sem depender de rede externa nem do R2 (o resto do
// seed usa um URL de R2 fixo que não existe de verdade, só serve pra
// testes que nunca precisam baixar o byte). imovelDobraAmbos é o único
// fixture SALE_AND_RENT com os dois preços preenchidos. imovelDobraSemPreco
// prova ausência de preço. imovelComBadgesOrgA (Org A) não tem foto
// nenhuma — prova o estado vazio.

test.describe("Criar divulgação — jornada completa", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_RECURSOS);
  });

  test("escolhe foto, troca de foto, escolhe formato, gera prévia e baixa", async ({ page }) => {
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria2}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText("Criar divulgação")).toBeVisible();

    // Duas fotos reais — a primeira (capa) já vem selecionada.
    const fotos = dialogo.getByRole("button", { name: /^Foto \d$/ });
    await expect(fotos).toHaveCount(2);
    await expect(fotos.first()).toHaveAttribute("aria-pressed", "true");

    // Troca para a segunda foto.
    await fotos.nth(1).click();
    await expect(fotos.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(fotos.first()).toHaveAttribute("aria-pressed", "false");

    // Formato: Story em vez do padrão (Feed).
    await dialogo.getByRole("button", { name: "Instagram Story" }).click();
    await expect(dialogo.getByRole("button", { name: "Instagram Story" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Dado real do fixture (price: 700000, sem purpose explícito = SALE).
    await expect(dialogo.getByText(/R\$\s*700\.000/)).toBeVisible();

    const [resposta] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/anuncio?") && r.request().method() === "GET"),
      dialogo.getByRole("button", { name: "Gerar prévia" }).click(),
    ]);
    expect(resposta.status()).toBe(200);
    expect(resposta.headers()["content-type"]).toBe("image/png");

    await expect(dialogo.getByRole("img", { name: /Prévia do anúncio/ })).toBeVisible();

    const botaoBaixar = dialogo.getByRole("button", { name: "Baixar" });
    await expect(botaoBaixar).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent("download"), botaoBaixar.click()]);
    expect(download.suggestedFilename()).toMatch(/^imovel-galeria-2-e2e-sao-paulo-story\.png$/i);
  });

});

test.describe("imóvel sem fotos", () => {
  test("mostra estado vazio, sem quebrar a tela", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText(/ainda não tem fotos cadastradas/)).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Gerar prévia" })).toBeDisabled();
  });
});

test.describe("SALE_AND_RENT nunca decide a finalidade sozinho", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_RECURSOS);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelDobraAmbos}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();
  });

  test("o seletor de finalidade aparece e 'Gerar prévia' fica bloqueado até uma escolha explícita", async ({
    page,
  }) => {
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText(/aceita venda e aluguel/)).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Gerar prévia" })).toBeDisabled();

    await dialogo.getByRole("button", { name: "À venda" }).click();
    await expect(dialogo.getByRole("button", { name: "Gerar prévia" })).toBeEnabled();
    // price: 900000 no fixture.
    await expect(dialogo.getByText(/R\$\s*900\.000/)).toBeVisible();

    await dialogo.getByRole("button", { name: "Para alugar" }).click();
    // rentPrice: 5000 no fixture — nunca mistura com o valor de venda.
    await expect(dialogo.getByText(/R\$\s*5\.000/)).toBeVisible();
    await expect(dialogo.getByText(/R\$\s*900\.000/)).toHaveCount(0);
  });
});

test.describe("ausência de preço nunca vira zero", () => {
  test("imóvel sem preço mostra aviso explícito, nunca 'R$ 0'", async ({ page }) => {
    await login(page, ORG_RECURSOS);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelDobraSemPreco}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText("sem preço informado")).toBeVisible();
    await expect(dialogo.getByText(/R\$\s*0\b/)).toHaveCount(0);
  });
});

test.describe("isolamento de tenant", () => {
  test("a API do anúncio recusa um imóvel de outra organização", async ({ page }) => {
    await login(page, ORG_RECURSOS);
    const resposta = await page.request.get(
      `/api/admin/imoveis/${IDS_E2E.imovelOrgB}/anuncio?mediaId=qualquer&formato=feed`
    );
    expect(resposta.status()).toBe(404);
  });

  test("sem sessão, a API recusa com 401", async ({ browser }) => {
    const contexto = await browser.newContext();
    const pagina = await contexto.newPage();
    const resposta = await pagina.request.get(
      `/api/admin/imoveis/${IDS_E2E.imovelGaleria2}/anuncio?mediaId=qualquer&formato=feed`
    );
    expect(resposta.status()).toBe(401);
    await contexto.close();
  });
});

test.describe("Carrossel (MKT-002) — jornada completa", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_RECURSOS);
  });

  test("seleciona fotos, reordena, gera, navega entre slides e baixa um deles", async ({ page }) => {
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria5}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Carrossel" }).click();

    // Seleciona 3 das 5 fotos reais, na ordem 1, 2, 3.
    const fotos = dialogo.getByRole("button", { name: /^Foto \d(,|$)/ });
    await expect(fotos).toHaveCount(5);
    await fotos.nth(0).click();
    await fotos.nth(1).click();
    await fotos.nth(2).click();

    const ordem = dialogo.locator("ol > li");
    await expect(ordem).toHaveCount(3);
    await expect(ordem.nth(0)).toContainText("Capa");
    await expect(ordem.nth(2)).toContainText("CTA final");

    // A 3ª foto escolhida (índice 2 na grade) começa na posição 3.
    await expect(
      dialogo.getByRole("button", { name: "Foto 3, selecionada, posição 3" })
    ).toBeVisible();

    // Sobe a 3ª foto pro topo: duas trocas, posição 3 -> 2 -> 1.
    await ordem.nth(2).getByRole("button", { name: /Subir foto 3/ }).click();
    await ordem.nth(1).getByRole("button", { name: /Subir foto 2/ }).click();

    // A mesma foto (índice 2 na grade) agora está na posição 1 — prova
    // que a troca moveu a IDENTIDADE da foto, não só o texto da lista.
    await expect(
      dialogo.getByRole("button", { name: "Foto 3, selecionada, posição 1" })
    ).toBeVisible();
    const ordemDepois = dialogo.locator("ol > li");
    await expect(ordemDepois.nth(0)).toContainText("Capa");

    const [resposta] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/anuncio?") && r.request().method() === "GET"),
      dialogo.getByRole("button", { name: "Gerar carrossel" }).click(),
    ]);
    expect(resposta.status()).toBe(200);

    await expect(dialogo.getByText("1/3")).toBeVisible();
    await expect(dialogo.getByRole("img", { name: /slide 1 de 3/ })).toBeVisible();

    await dialogo.getByRole("button", { name: "Próximo slide" }).click();
    await expect(dialogo.getByText("2/3")).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Slide anterior" })).toBeEnabled();

    await dialogo.getByRole("button", { name: "Próximo slide" }).click();
    await expect(dialogo.getByText("3/3")).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Próximo slide" })).toBeDisabled();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialogo.getByRole("button", { name: "Baixar este slide" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^imovel-galeria-5-e2e-sao-paulo-carrossel-03\.png$/i
    );
  });

  test("imóvel com apenas uma foto não oferece a opção Carrossel", async ({ page }) => {
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria1}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByRole("button", { name: "Carrossel" })).toBeDisabled();
  });
});

test.describe("Carrossel — SALE_AND_RENT nunca decide sozinho", () => {
  test("'Gerar carrossel' fica bloqueado até a finalidade ser escolhida explicitamente", async ({
    page,
  }) => {
    await login(page, ORG_RECURSOS);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelCarrosselAmbos}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Carrossel" }).click();

    const fotos = dialogo.getByRole("button", { name: /^Foto \d(,|$)/ });
    await fotos.nth(0).click();
    await fotos.nth(1).click();

    await expect(dialogo.getByText(/aceita venda e aluguel/)).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Gerar carrossel" })).toBeDisabled();

    await dialogo.getByRole("button", { name: "À venda" }).click();
    await expect(dialogo.getByRole("button", { name: "Gerar carrossel" })).toBeEnabled();
  });
});

test.describe("Carrossel — falha parcial e isolamento de tenant", () => {
  test("a API recusa um mediaId de outro imóvel mesmo dentro do fluxo de carrossel", async ({
    page,
  }) => {
    await login(page, ORG_RECURSOS);
    const resposta = await page.request.get(
      `/api/admin/imoveis/${IDS_E2E.imovelGaleria5}/anuncio?mediaId=${IDS_E2E.imovelOrgB}&formato=feed&papel=foto`
    );
    expect(resposta.status()).toBe(400);
  });
});

test.describe("Carrossel — responsivo", () => {
  test("390px: seleção, ordem e navegação entre slides cabem na tela", async ({ page }) => {
    await login(page, ORG_RECURSOS);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria3}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Carrossel" }).click();

    const fotos = dialogo.getByRole("button", { name: /^Foto \d(,|$)/ });
    await fotos.nth(0).click();
    await fotos.nth(1).click();

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/anuncio?")),
      dialogo.getByRole("button", { name: "Gerar carrossel" }).click(),
    ]);
    await expect(dialogo.getByText("1/2")).toBeVisible();

    const semOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflow).toBe(true);
  });
});

test.describe("Legenda (MKT-003) — jornada completa", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await login(page, ORG_RECURSOS);
  });

  test("escolhe canal, lê o texto, copia, troca de canal, edita e copia o texto editado", async ({
    page,
  }) => {
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria1}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Legenda" }).click();

    // SALE sem ambiguidade: a legenda já aparece sem precisar escolher finalidade.
    await expect(dialogo.getByRole("button", { name: "Instagram" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    const textarea = dialogo.locator("#legenda-texto");
    await expect(textarea).toBeVisible();
    const textoInstagram = await textarea.inputValue();
    expect(textoInstagram).toMatch(/R\$\s*700\.000/);
    expect(textoInstagram).toMatch(/#\w+/); // Instagram tem hashtags

    await dialogo.getByRole("button", { name: "Copiar legenda" }).click();
    await expect(dialogo.getByText("Legenda copiada")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(textoInstagram);

    // Troca pra Facebook: texto recalculado a partir dos MESMOS fatos — sem hashtags.
    await dialogo.getByRole("button", { name: "Facebook" }).click();
    const textoFacebook = await textarea.inputValue();
    expect(textoFacebook).not.toMatch(/#\w+/);
    expect(textoFacebook).toMatch(/R\$\s*700\.000/);

    // Edita manualmente e troca pra WhatsApp e volta — o rascunho do Facebook sobrevive.
    await textarea.fill("Texto editado à mão para o Facebook.");
    await dialogo.getByRole("button", { name: "WhatsApp" }).click();
    await expect(textarea).toHaveValue(/\*R\$\s*700\.000\*/);
    await dialogo.getByRole("button", { name: "Facebook" }).click();
    await expect(textarea).toHaveValue("Texto editado à mão para o Facebook.");

    await dialogo.getByRole("button", { name: "Copiar legenda" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "Texto editado à mão para o Facebook."
    );
  });

  test("'Restaurar sugestão' descarta a edição e volta ao texto determinístico", async ({ page }) => {
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria1}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Legenda" }).click();

    const textarea = dialogo.locator("#legenda-texto");
    const sugestao = await textarea.inputValue();
    await textarea.fill("Qualquer outra coisa");
    await dialogo.getByRole("button", { name: "Restaurar sugestão" }).click();
    await expect(textarea).toHaveValue(sugestao);
  });

  // MKT-006 — link rastreável: a MESMA URL canônica da ficha pública
  // (MKT-005), com utm_source do canal escolhido. Não depende de
  // finalidade/foto — só do canal, então aparece mesmo antes da legenda
  // em si existir para este imóvel.
  test("gera um link rastreável por canal e copia o link", async ({ page }) => {
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria1}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Legenda" }).click();

    // Instagram é o canal padrão.
    const campoLink = dialogo.locator("#link-rastreavel");
    await expect(campoLink).toBeVisible();
    const linkInstagram = await campoLink.inputValue();
    const urlInstagram = new URL(linkInstagram);
    expect(urlInstagram.pathname).toBe(`/e2e-org-recursos/imoveis/${IDS_E2E.imovelGaleria1}`);
    expect(urlInstagram.searchParams.get("utm_source")).toBe("instagram");
    expect(urlInstagram.searchParams.get("utm_medium")).toBe("divulgacao");

    // Troca de canal: o link muda de utm_source, o caminho continua o mesmo.
    await dialogo.getByRole("button", { name: "WhatsApp" }).click();
    const linkWhatsapp = await campoLink.inputValue();
    const urlWhatsapp = new URL(linkWhatsapp);
    expect(urlWhatsapp.pathname).toBe(urlInstagram.pathname);
    expect(urlWhatsapp.searchParams.get("utm_source")).toBe("whatsapp");

    await dialogo.getByRole("button", { name: "Copiar link" }).click();
    await expect(dialogo.getByText("Link copiado")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(linkWhatsapp);
  });
});

test.describe("Legenda — imóvel sem fotos", () => {
  test("funciona mesmo sem nenhuma foto cadastrada", async ({ page }) => {
    await login(page, ORG_A);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelComBadgesOrgA}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();
    const dialogo = page.getByRole("dialog");

    await dialogo.getByRole("button", { name: "Legenda" }).click();
    await expect(dialogo.locator("#legenda-texto")).toBeVisible();
  });
});

test.describe("Legenda — SALE_AND_RENT nunca decide sozinho", () => {
  test("a legenda só aparece depois da escolha explícita de finalidade", async ({ page }) => {
    await login(page, ORG_RECURSOS);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelCarrosselAmbos}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Legenda" }).click();

    await expect(dialogo.getByText("Escolha a finalidade abaixo para gerar a legenda.")).toBeVisible();
    await expect(dialogo.locator("#legenda-texto")).toHaveCount(0);
    await expect(dialogo.getByRole("button", { name: "Copiar legenda" })).toBeDisabled();

    await dialogo.getByRole("button", { name: "Para alugar" }).click();
    const textarea = dialogo.locator("#legenda-texto");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(/R\$\s*4\.200\/mês/);
    await expect(dialogo.getByRole("button", { name: "Copiar legenda" })).toBeEnabled();
  });
});

test.describe("Legenda — responsivo", () => {
  test("390px: canal, textarea e botão de copiar cabem na tela, sem overflow", async ({ page }) => {
    await login(page, ORG_RECURSOS);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria1}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Legenda" }).click();

    await expect(dialogo.locator("#legenda-texto")).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Copiar legenda" })).toBeVisible();

    const semOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflow).toBe(true);
  });
});

test.describe("responsivo", () => {
  test("390px: o diálogo cabe na tela e o botão continua alcançável", async ({ page }) => {
    await login(page, ORG_RECURSOS);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria2}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Gerar prévia" })).toBeVisible();

    const semOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflow).toBe(true);
  });
});

// =======================================================================
// Kit de divulgação (MKT-004) — invalidação de resultado obsoleto
// =======================================================================
// Achado real da leitura do código (seção 22/23 do pedido): trocar foto,
// formato ou finalidade DEPOIS de já ter gerado uma prévia não limpava o
// blob antigo — o botão "Baixar" continuava habilitado, deixando baixar
// uma imagem com a foto/preço/finalidade ERRADOS em relação ao que a
// tela mostrava estar selecionado no momento do clique. As três provas
// abaixo cobrem exatamente essa lacuna (seção 36.D/36.E).
test.describe("Kit de divulgação — invalidação de prévia obsoleta", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_RECURSOS);
  });

  test("trocar de foto depois de gerar a prévia invalida o resultado antigo", async ({ page }) => {
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria2}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();
    const dialogo = page.getByRole("dialog");

    const fotos = dialogo.getByRole("button", { name: /^Foto \d$/ });
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/anuncio?")),
      dialogo.getByRole("button", { name: "Gerar prévia" }).click(),
    ]);
    await expect(dialogo.getByRole("img", { name: /Prévia do anúncio/ })).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Baixar" })).toBeEnabled();

    await fotos.nth(1).click();

    // A prévia da foto ANTERIOR não pode continuar parecendo válida.
    await expect(dialogo.getByRole("img", { name: /Prévia do anúncio/ })).toHaveCount(0);
    await expect(dialogo.getByRole("button", { name: "Baixar" })).toBeDisabled();
  });

  test("trocar de formato depois de gerar a prévia invalida o resultado antigo", async ({ page }) => {
    await page.goto(`/app/imoveis/${IDS_E2E.imovelGaleria2}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();
    const dialogo = page.getByRole("dialog");

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/anuncio?")),
      dialogo.getByRole("button", { name: "Gerar prévia" }).click(),
    ]);
    await expect(dialogo.getByRole("img", { name: /Prévia do anúncio/ })).toBeVisible();

    await dialogo.getByRole("button", { name: "Instagram Story" }).click();

    await expect(dialogo.getByRole("img", { name: /Prévia do anúncio/ })).toHaveCount(0);
    await expect(dialogo.getByRole("button", { name: "Baixar" })).toBeDisabled();
  });

  test("trocar de finalidade (SALE_AND_RENT) invalida a prévia visual E o carrossel já gerados", async ({
    page,
  }) => {
    await page.goto(`/app/imoveis/${IDS_E2E.imovelCarrosselAmbos}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();
    const dialogo = page.getByRole("dialog");

    await dialogo.getByRole("button", { name: "À venda" }).click();
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/anuncio?")),
      dialogo.getByRole("button", { name: "Gerar prévia" }).click(),
    ]);
    await expect(dialogo.getByRole("img", { name: /Prévia do anúncio/ })).toBeVisible();

    await dialogo.getByRole("button", { name: "Carrossel" }).click();
    const fotosCarrossel = dialogo.getByRole("button", { name: /^Foto \d(,|$)/ });
    await fotosCarrossel.nth(0).click();
    await fotosCarrossel.nth(1).click();
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/anuncio?")),
      dialogo.getByRole("button", { name: "Gerar carrossel" }).click(),
    ]);
    await expect(dialogo.getByText("1/2")).toBeVisible();

    // Finalidade é estado COMPARTILHADO entre imagem/carrossel/legenda —
    // mudar aqui precisa invalidar os dois resultados visuais já gerados,
    // não só o rascunho de legenda (que já era limpo antes da MKT-004).
    await dialogo.getByRole("button", { name: "Para alugar" }).click();

    await expect(dialogo.getByText("1/2")).toHaveCount(0);
    await expect(dialogo.getByRole("button", { name: "Baixar este slide" })).toBeDisabled();

    await dialogo.getByRole("button", { name: "Imagem única" }).click();
    await expect(dialogo.getByRole("img", { name: /Prévia do anúncio/ })).toHaveCount(0);
    await expect(dialogo.getByRole("button", { name: "Baixar" })).toBeDisabled();
  });
});

test.describe("Kit de divulgação — consistência entre material visual e legenda", () => {
  test("a mesma finalidade escolhida aparece igual no material visual e na legenda", async ({ page }) => {
    await login(page, ORG_RECURSOS);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelCarrosselAmbos}`);
    await page.getByRole("button", { name: "Criar divulgação" }).click();
    const dialogo = page.getByRole("dialog");

    await dialogo.getByRole("button", { name: "Para alugar" }).click();
    await expect(dialogo.getByText(/R\$\s*4\.200/)).toBeVisible();

    await dialogo.getByRole("button", { name: "Legenda" }).click();
    // Mesma finalidade, sem perguntar de novo — e o preço de ALUGUEL
    // (nunca o de venda) aparece no texto, coerente com o que o material
    // visual já estava mostrando.
    await expect(dialogo.getByRole("button", { name: "Para alugar" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(dialogo.locator("#legenda-texto")).toHaveValue(/R\$\s*4\.200\/mês/);
  });
});
