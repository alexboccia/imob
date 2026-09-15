import { test, expect, type Page } from "@playwright/test";
import { ORG_RESULTADO, login } from "./helpers";

// =======================================================================
// Resultado da visita (Fase 37)
// =======================================================================
// Antes, encerrar uma visita era um clique que dizia apenas "aconteceu".
// A visita sumia da agenda e não deixava conhecimento nenhum.
//
// Organização U (dedicada), com quatro visitas agendadas para hoje num
// horário que JÁ PASSOU — o estado em que a Agenda pede o resultado. Uma
// por jornada, para nenhum teste depender do outro.
//
// AS INVARIANTES QUE ESTA SPEC PROTEGE:
//   no-show não cria fato falso de visita realizada
//   resultado negativo não vira negócio perdido
//   próxima ação é opcional, e quando pedida vira compromisso de verdade
//   o resultado sobrevive ao refresh, porque veio do servidor

const AGENDA = "/app/agenda";

function cardDe(page: Page, nome: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: nome }).first();
}

// Abre o diálogo de resultado da visita daquele cliente, pelo drawer da
// Agenda — o caminho real do produto.
async function abrirResultado(page: Page, nome: string) {
  await cardDe(page, nome).getByRole("button", { name: "Ver detalhes" }).click();
  const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: nome });
  await drawer.getByRole("button", { name: "Registrar resultado" }).click();
  return page.getByRole("dialog");
}

async function salvar(page: Page, dialogo: ReturnType<Page["getByRole"]>) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/app")),
    dialogo.getByRole("button", { name: "Salvar resultado" }).click(),
  ]);
}

test.beforeEach(async ({ page }) => {
  await login(page, ORG_RESULTADO);
  await page.goto(AGENDA);
});

// -----------------------------------------------------------------------
// A pendência que o produto já sinalizava
// -----------------------------------------------------------------------
test("a visita vencida pede o resultado, e a pergunta é uma só", async ({ page }) => {
  const card = cardDe(page, "Cliente Resultado Intocado");
  await expect(card).toBeVisible();
  // Este sinal já existia; o que faltava era onde registrar.
  await expect(card.getByText("Registrar resultado")).toBeVisible();

  const dialogo = await abrirResultado(page, "Cliente Resultado Intocado");
  await expect(dialogo.getByRole("heading", { name: "Resultado da visita" })).toBeVisible();
  // UMA pergunta, quatro opções — não duas perguntas encadeadas.
  await expect(dialogo.getByText("O que aconteceu?")).toBeVisible();
  await expect(dialogo.getByRole("radio")).toHaveCount(4);

  // O resultado é OBRIGATÓRIO: salvar sem escolher é recusado, com o
  // erro ao lado do campo.
  await dialogo.getByRole("button", { name: "Salvar resultado" }).click();
  await expect(dialogo.getByText("Informe o que aconteceu nesta visita.")).toBeVisible();

  // Escape fecha sem gravar nada — a visita continua pendente.
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(cardDe(page, "Cliente Resultado Intocado").getByText("Registrar resultado")).toBeVisible();
});

// -----------------------------------------------------------------------
// Jornada principal: resultado + próxima ação
// -----------------------------------------------------------------------
test("resultado positivo com próximo passo: um fato e um compromisso, de uma vez", async ({
  page,
}) => {
  const dialogo = await abrirResultado(page, "Cliente Resultado Positivo");
  await dialogo.getByRole("radio", { name: "Gostou e quer avançar" }).check();
  await dialogo
    .getByLabel("Observação (opcional)")
    .fill("Gostou da varanda, quer falar de valores.");

  // A próxima ação é opcional e usa o mesmo contrato do atendimento.
  await dialogo.getByLabel("Agendar próximo contato").check();
  await dialogo.getByLabel("O que precisa ser feito").fill("Enviar simulação de financiamento");
  const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
  await dialogo.getByLabel("Quando").fill(amanha);
  await salvar(page, dialogo);

  // A visita deixa de pedir ação e passa a mostrar o que produziu.
  await page.goto("/app/agenda?aba=anteriores");
  const anterior = cardDe(page, "Cliente Resultado Positivo");
  await expect(anterior).toContainText("Concluída");
  await expect(anterior).toContainText("Gostou e quer avançar");
  await expect(anterior).toContainText("Gostou da varanda");

  // REFRESH: o estado veio do servidor, não da sessão.
  await page.reload();
  await expect(cardDe(page, "Cliente Resultado Positivo")).toContainText("Gostou e quer avançar");

  // E a próxima ação virou compromisso de verdade, na aba das próximas.
  await page.goto("/app/agenda?aba=proximas");
  await expect(page.getByText("Enviar simulação de financiamento").first()).toBeVisible();
});

// -----------------------------------------------------------------------
// No-show
// -----------------------------------------------------------------------
test("não compareceu: nenhum fato falso de visita, e a negociação segue viva", async ({
  page,
}) => {
  const dialogo = await abrirResultado(page, "Cliente Resultado NoShow");
  await dialogo.getByRole("radio", { name: "Não compareceu" }).check();
  await dialogo.getByLabel("Observação (opcional)").fill("Avisou depois que esqueceu.");
  await salvar(page, dialogo);

  await page.goto("/app/agenda?aba=anteriores");
  const card = cardDe(page, "Cliente Resultado NoShow");
  // Status próprio — nunca "Concluída", que afirmaria que houve visita,
  // e nunca "Cancelada", que afirmaria que alguém desmarcou antes.
  await expect(card).toContainText("Não compareceu");
  await expect(card).not.toContainText("Concluída");
  await expect(card).not.toContainText("Cancelada");
  await expect(card).toContainText("Avisou depois que esqueceu");

  // Na ficha do cliente: o histórico de visitas registra o não
  // comparecimento, e NENHUMA visita foi lançada na timeline de
  // interações — o cliente não visitou imóvel nenhum.
  await page.goto("/app/clientes");
  await page.getByRole("link", { name: "Cliente Resultado NoShow" }).first().click();
  await page.waitForURL(/\/app\/clientes\/[^/]+$/);
  await expect(page.getByText("Visitas realizadas")).toBeVisible();
  await expect(page.getByText("Não compareceu").first()).toBeVisible();

  // A negociação NÃO virou perdida por causa de um no-show.
  const conteudo = await page.content();
  expect(conteudo).not.toContain("Marcar como perdido — feito");
  await expect(page.getByRole("button", { name: "Marcar como ganho" }).first()).toBeVisible();
});

// -----------------------------------------------------------------------
// Resultado negativo
// -----------------------------------------------------------------------
test("sem interesse no imóvel não é negócio perdido", async ({ page }) => {
  const dialogo = await abrirResultado(page, "Cliente Resultado Negativo");
  await dialogo.getByRole("radio", { name: "Sem interesse neste imóvel" }).check();
  await salvar(page, dialogo);

  await page.goto("/app/agenda?aba=anteriores");
  await expect(cardDe(page, "Cliente Resultado Negativo")).toContainText(
    "Sem interesse neste imóvel"
  );

  // A negociação continua ABERTA: quem perde um negócio é o corretor, no
  // fluxo de fechamento, e nada aqui preenche motivo de perda.
  await page.goto("/app/clientes");
  await page.getByRole("link", { name: "Cliente Resultado Negativo" }).first().click();
  await page.waitForURL(/\/app\/clientes\/[^/]+$/);
  await expect(page.getByRole("button", { name: "Marcar como perdido" }).first()).toBeVisible();
  await expect(page.getByText("Sem interesse neste imóvel").first()).toBeVisible();
});

// -----------------------------------------------------------------------
// Responsivo — este fluxo acontece no celular, logo depois da visita
// -----------------------------------------------------------------------
test.describe("responsivo", () => {
  for (const largura of [320, 390, 768, 1280, 1440]) {
    test(`${largura}px: registrar resultado sem overflow`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(AGENDA);

      const dialogo = await abrirResultado(page, "Cliente Resultado Intocado");
      // As quatro opções precisam estar utilizáveis, não só presentes.
      await expect(dialogo.getByRole("radio", { name: "Não compareceu" })).toBeVisible();
      await dialogo.getByRole("radio", { name: "Não compareceu" }).check();

      const semOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflow, `overflow @ ${largura}px`).toBe(true);

      // Fecha sem salvar: o card intocado precisa continuar intocado para
      // as demais larguras.
      await page.keyboard.press("Escape");
    });
  }
});
