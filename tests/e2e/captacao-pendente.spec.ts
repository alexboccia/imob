import { test, expect, type Page } from "@playwright/test";
import {
  login,
  entrarComo,
  esperarJanelaAntiSpam,
  ORG_A,
  ORG_CAPTACAO,
  ORG_CAPTACAO_CORRETOR,
  COLISAO_CAPTACAO,
} from "./helpers";

// =======================================================================
// Garantia de captura (Fase 24)
// =======================================================================
// A afirmação que estes testes protegem, ponta a ponta:
//
//   TODO LEAD PUBLICAMENTE ACEITO DEIXA UM REGISTRO RECUPERÁVEL.
//
// O caminho é o real: um visitante envia o formulário do site, recebe a
// confirmação, e o contato aparece no painel esperando identificação.

const BASE = `/${ORG_CAPTACAO.slug}`;

async function enviarContatoAmbiguo(page: import("@playwright/test").Page, nome: string) {
  await page.goto(`${BASE}/contato`);
  await esperarJanelaAntiSpam(page);
  await page.locator("#nome").fill(nome);
  await page.locator("#email").fill(COLISAO_CAPTACAO.email);
  await page.locator("#telefone").fill(COLISAO_CAPTACAO.telefone);
  await page.locator("#mensagem").fill("Tenho interesse e gostaria de mais detalhes.");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  // O visitante vê exatamente a mesma confirmação do caminho feliz — e a
  // partir desta fase ela é verdadeira mesmo sob conflito.
  await expect(page.getByText(/Mensagem enviada com sucesso/)).toBeVisible();
}

test.describe("Captação ambígua — nada se perde", () => {
  test("contato ambíguo é guardado, aparece na fila e é vinculado ao cliente escolhido", async ({
    page,
  }) => {
    const nome = `Visitante Ambiguo ${Date.now()}`;
    await enviarContatoAmbiguo(page, nome);

    await entrarComo(page, ORG_CAPTACAO);

    // A Home avisa: é trabalho atrasado por definição — o cliente já
    // escreveu e ninguém respondeu.
    const blocoHome = page
      .locator("h2")
      .filter({ hasText: "Contatos pendentes de identificação" });
    await expect(blocoHome).toBeVisible();
    await expect(page.getByRole("link", { name: "Contatos a identificar" })).toBeVisible();

    await page.goto("/app/captacoes");
    const item = page.locator("li").filter({ hasText: nome });
    await expect(item).toBeVisible();
    // Os DADOS ENVIADOS estão à vista: sem eles não há como decidir.
    await expect(item.getByText(COLISAO_CAPTACAO.email)).toBeVisible();
    await expect(item.getByText("Tenho interesse e gostaria de mais detalhes.")).toBeVisible();

    // Os dois candidatos, cada um com o motivo pelo qual apareceu.
    await expect(item.getByText("Cliente do E-mail")).toBeVisible();
    await expect(item.getByText("Cliente do Telefone")).toBeVisible();
    await expect(item.getByText("mesmo e-mail")).toBeVisible();
    await expect(item.getByText("mesmo telefone")).toBeVisible();

    await item.getByRole("radio").first().check();
    await item.getByRole("button", { name: "Vincular contato" }).click();
    // A confirmação é um toast justamente porque a linha resolvida sai da
    // fila — esperar por ela DENTRO do item esperaria por algo que já
    // deixou de existir.
    await expect(page.getByText("Contato identificado e adicionado ao histórico do cliente.")).toBeVisible();
    await expect(item).toHaveCount(0);

    // Resolvido significa FORA da fila — e dentro do histórico do cliente.
    await page.goto("/app/captacoes");
    // A asserção é sobre ESTA captação ter saído da fila — e não sobre a
    // fila estar vazia: outro teste deste arquivo deixa uma pendente de
    // propósito, e um retry isolado tornaria a versão global instável.
    await expect(page.getByText(nome)).toHaveCount(0);

    await page.goto("/app/clientes");
    await page.getByRole("link", { name: /Cliente do E-mail/ }).first().click();
    await page.waitForURL(/\/app\/clientes\/.+/);
    // Fase 79 — escopa pelo <section> (h2 agora aninhado dentro do
    // próprio CabecalhoSecao, não mais filho direto de quem tem a lista).
    const historico = page.locator("section", {
      has: page.getByRole("heading", { level: 2, name: "Histórico de interações" }),
    });
    await expect(
      historico.getByText("Tenho interesse e gostaria de mais detalhes.")
    ).toBeVisible();
  });

  test("a fila é gerencial: o corretor não vê o item de menu e não abre a tela", async ({
    page,
  }) => {
    const nome = `Visitante Do Corretor ${Date.now()}`;
    await enviarContatoAmbiguo(page, nome);

    await entrarComo(page, ORG_CAPTACAO_CORRETOR);
    await expect(page.getByRole("link", { name: "Contatos a identificar" })).toHaveCount(0);
    // Nem o bloco da Home: para o corretor a tela continua idêntica ao
    // que era antes desta fase.
    await expect(
      page.locator("h2").filter({ hasText: "Contatos pendentes de identificação" })
    ).toHaveCount(0);

    // Esconder o menu não é controle de acesso — o servidor recusa a URL
    // digitada à mão, e o dado de contato nunca é renderizado.
    await page.goto("/app/captacoes");
    await page.waitForURL(/\/app$/);
    await expect(page.getByText(nome)).toHaveCount(0);
  });

  test.describe("no celular", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("a fila é legível e resolvível numa viewport estreita", async ({ page }) => {
      const nome = `Visitante Mobile ${Date.now()}`;
      await enviarContatoAmbiguo(page, nome);
      await entrarComo(page, ORG_CAPTACAO);
      await page.goto("/app/captacoes");

      const item = page.locator("li").filter({ hasText: nome });
      await expect(item).toBeVisible();

      // Nada de rolagem horizontal: e-mail e mensagem quebram dentro da
      // coluna estreita em vez de empurrar a página inteira.
      const larguras = await page.evaluate(() => ({
        conteudo: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(larguras.conteudo).toBeLessThanOrEqual(larguras.viewport);

      // E é operável: o alvo de toque do rádio e o botão funcionam.
      await item.getByRole("radio").first().check();
      await item.getByRole("button", { name: "Vincular contato" }).click();
      await expect(page.getByText("Contato identificado e adicionado ao histórico do cliente.")).toBeVisible();
    });
  });
});

// =======================================================================
// Redesenho visual — sistema de backoffice (Fase 70)
// =======================================================================
// Estes testes cobrem SÓ a apresentação: hierarquia, ausência de
// funcionalidade inventada, estado vazio e responsividade. A garantia de
// captura (dado nunca se perde, a única ação é vincular) já está provada
// acima e continua passando sem nenhuma adaptação — a prova de que o
// redesenho não mudou uma regra sequer.

function secaoContatosPendentes(page: Page) {
  return page.getByRole("heading", { level: 2 }).filter({ hasText: "Contatos pendentes" });
}

test.describe("estrutura da tela redesenhada (Fase 70)", () => {
  test("hierarquia de cabeçalhos sem salto: h1 -> h2, nunca h1 -> h3", async ({ page }) => {
    const nome = `Visitante Hierarquia ${Date.now()}`;
    await enviarContatoAmbiguo(page, nome);
    await entrarComo(page, ORG_CAPTACAO);
    await page.goto("/app/captacoes");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText("Contatos a identificar");
    await expect(secaoContatosPendentes(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
    // Só um h1 na página.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("nenhuma aba, busca ou filtro foi inventado", async ({ page }) => {
    const nome = `Visitante SemFiltro ${Date.now()}`;
    await enviarContatoAmbiguo(page, nome);
    await entrarComo(page, ORG_CAPTACAO);
    await page.goto("/app/captacoes");

    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.locator('input[type="search"]')).toHaveCount(0);
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.locator("select")).toHaveCount(0);
  });

  test("nenhum CTA inventado: sem 'adicionar', 'importar' ou 'criar cliente'", async ({
    page,
  }) => {
    const nome = `Visitante SemCTA ${Date.now()}`;
    await enviarContatoAmbiguo(page, nome);
    await entrarComo(page, ORG_CAPTACAO);
    await page.goto("/app/captacoes");

    // A ÚNICA ação real é vincular ao cliente (por candidato). Nenhuma
    // destas quatro existe no código (ResolverCaptacao.tsx é explícito:
    // "sem opção criar novo cliente e sem unificar cadastros").
    for (const rotulo of [
      "Adicionar contato",
      "Novo contato",
      "Importar contatos",
      "Criar cliente",
    ]) {
      await expect(page.getByRole("button", { name: rotulo })).toHaveCount(0);
      await expect(page.getByRole("link", { name: rotulo })).toHaveCount(0);
    }
  });

  test("captação sem imóvel de origem não mostra linha de imóvel", async ({ page }) => {
    // O formulário geral de /contato nunca envia imovelId — é o caminho
    // real coberto pelo resto deste arquivo, e o campo é condicional no
    // componente (só aparece quando `captacao.imovel` existe).
    const nome = `Visitante SemImovel ${Date.now()}`;
    await enviarContatoAmbiguo(page, nome);
    await entrarComo(page, ORG_CAPTACAO);
    await page.goto("/app/captacoes");

    const item = page.locator("li").filter({ hasText: nome });
    await expect(item).toBeVisible();
    await expect(item.getByText("Imóvel:")).toHaveCount(0);
  });
});

test.describe("estado vazio (Fase 70)", () => {
  // Org A nunca recebeu uma captação ambígua (nenhum spec cria conflito
  // de identidade lá) — mesma fixture que admin-responsivo.spec.ts já
  // usa para este mesmo vazio.
  test("usa o componente compartilhado, com texto factual e sem CTA inventado", async ({
    page,
  }) => {
    await login(page, ORG_A);
    await page.goto("/app/captacoes");

    await expect(page.getByRole("heading", { level: 1, name: "Contatos a identificar" })).toBeVisible();
    await expect(secaoContatosPendentes(page)).toBeVisible();

    const vazio = page.locator("[data-estado-vazio]");
    await expect(vazio).toBeVisible();
    await expect(vazio.getByText("Nenhum contato para identificar")).toBeVisible();
    // A frase é factual sobre a REGRA real (e-mail e telefone apontando
    // para clientes diferentes) — não um genérico "nada aqui ainda".
    await expect(
      vazio.getByText(/e-mail e telefone apontando para clientes diferentes/)
    ).toBeVisible();
    await expect(vazio.getByRole("button")).toHaveCount(0);
    await expect(vazio.getByRole("link")).toHaveCount(0);
  });
});

test.describe("responsivo (Fase 70)", () => {
  // Larguras alinhadas ao conjunto canônico já usado nas demais páginas
  // redesenhadas do backoffice (Dashboard/Pipeline/Imóveis/Analytics/
  // Minhas comissões), em vez de um conjunto próprio desta spec.
  for (const largura of [1920, 1440, 1366, 1024, 768, 390]) {
    test(`${largura}px: sem overflow e sem truncamento`, async ({ page }) => {
      const nome = `Visitante Responsivo ${largura} ${Date.now()}`;
      await enviarContatoAmbiguo(page, nome);
      await entrarComo(page, ORG_CAPTACAO);
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/app/captacoes");

      await expect(page.getByRole("heading", { level: 1, name: "Contatos a identificar" })).toBeVisible();
      const item = page.locator("li").filter({ hasText: nome });
      await expect(item).toBeVisible();

      const semOverflowDocumento = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflowDocumento, `overflow horizontal do documento em ${largura}px`).toBe(true);

      // Nome, contador e data-hora — os três textos mais suscetíveis a
      // cortar numa coluna estreita atrás da sidebar — medidos contra o
      // scrollWidth real, não só a ausência de overflow do documento.
      const medidas = await page
        .locator("h1, h2")
        .filter({ hasText: /Contatos/ })
        .evaluateAll((els) =>
          els.map((el) => ({
            texto: (el.textContent ?? "").trim(),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          }))
        );
      for (const m of medidas) {
        expect(
          m.scrollWidth,
          `"${m.texto}" cortado em ${largura}px`
        ).toBeLessThanOrEqual(m.clientWidth + 1);
      }
    });
  }
});
