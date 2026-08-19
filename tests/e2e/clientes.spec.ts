import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page, ORG_A);
});

// Redesenho da tela de Clientes (CRM) — fluxo completo: KPIs renderizam,
// "Novo cliente" cria um lead pelo Sheet, ele aparece na tabela, a busca
// encontra, o clique na linha abre o drawer com o dado certo, e o drawer
// fecha. Nomes com timestamp pra nunca colidir com clientes de execuções
// anteriores (Person só é limpa no global-setup, não entre specs).
test("KPIs renderizam, cria cliente pelo Sheet, busca encontra, drawer mostra os dados corretos", async ({ page }) => {
  const nomeUnico = `Cliente E2E ${Date.now()}`;

  await page.goto("/app/clientes");

  // KPIs — os 4 cards do topo sempre renderizam, mesmo sem nenhum cliente
  // ainda (valor "0"), nunca lançam erro.
  await expect(page.getByText("Todos os clientes")).toBeVisible();
  await expect(page.getByText("Novos leads")).toBeVisible();
  await expect(page.getByText("Em atendimento")).toBeVisible();
  await expect(page.getByText("Visitas agendadas")).toBeVisible();

  // Cria o cliente pelo Sheet lateral (não mais um form sempre visível no
  // topo da página).
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByPlaceholder("Nome", { exact: true }).fill(nomeUnico);
  await page.getByPlaceholder("Telefone/WhatsApp").fill("11988887777");
  await page.getByRole("button", { name: "Cadastrar" }).click();

  // Sheet fecha sozinho após sucesso (onSuccess -> setOpen(false)).
  await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

  // A listagem revalida e mostra o cliente recém-criado — busca pelo
  // parâmetro de URL server-driven (não filtragem client-side).
  await page.getByPlaceholder("Buscar por nome, telefone ou e-mail...").fill(nomeUnico);
  // Espera a navegação debounced da busca terminar antes de interagir com
  // a linha — senão a navegação da busca (em voo) pode competir com a
  // interação seguinte.
  await page.waitForURL(/search=/);
  const linha = page.getByRole("row", { name: new RegExp(nomeUnico) });
  await expect(linha).toBeVisible();

  // Clique na linha abre o drawer — mas o nome em si é um <Link> pra ficha
  // completa e propositalmente NÃO abre o drawer (stopPropagation, ver
  // columns.tsx), então o clique precisa ser numa célula neutra da mesma
  // linha, como o badge de estágio ("Novo lead", padrão de todo cliente
  // novo).
  await linha.getByText("Novo lead").click();
  // Escopado ao painel do drawer (não à página inteira) — a tabela por
  // trás também mostra "Interesse não informado" na mesma linha, e uma
  // busca sem escopo bateria nos dois elementos (strict mode violation).
  const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: nomeUnico });
  const drawerTitulo = drawer.getByRole("heading", { name: nomeUnico });
  await expect(drawerTitulo).toBeVisible();
  await expect(drawer.getByText("Interesse não informado")).toBeVisible();

  // Fecha o drawer via ESC (nativo do Drawer do Base UI) — volta pra
  // listagem.
  await page.keyboard.press("Escape");
  await expect(drawerTitulo).not.toBeVisible();
});

// Filtro por estágio (chip) — mesmo contrato de URL do FiltroDropdown que
// já existia, só a apresentação virou chip.
test("filtro de estágio por chip esconde cliente que não está naquele estágio", async ({ page }) => {
  const nomeUnico = `Cliente Chip E2E ${Date.now()}`;

  await page.goto("/app/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByPlaceholder("Nome", { exact: true }).fill(nomeUnico);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

  await page.getByPlaceholder("Buscar por nome, telefone ou e-mail...").fill(nomeUnico);
  await expect(page.getByRole("cell", { name: nomeUnico })).toBeVisible();

  // Cliente novo é sempre NEW_LEAD — o chip "Perdido" nunca deveria
  // mostrá-lo.
  await page.getByRole("button", { name: "Perdido", exact: true }).click();
  await expect(page.getByRole("cell", { name: nomeUnico })).not.toBeVisible();

  // Voltando pra "Todos", reaparece.
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(page.getByRole("cell", { name: nomeUnico })).toBeVisible();
});

// Correção cirúrgica pós-auditoria — origem/papel manipulados na URL
// causavam PrismaClientValidationError (HTTP 500, reproduzido ao vivo na
// auditoria pré-commit). sanitizarFiltro (crm-labels.ts) fecha essa
// lacuna: valor fora da allowlist é ignorado, nunca chega ao Prisma.
for (const [rotulo, filtro] of [
  ["origem inválida", { origem: "GARBAGE" }],
  ["papel inválido", { papel: "GARBAGE" }],
  ["origem válida + papel inválido", { origem: "WEBSITE", papel: "GARBAGE" }],
  ["origem inválida + papel válido", { origem: "GARBAGE", papel: "LEAD" }],
  ["ambos inválidos", { origem: "GARBAGE", papel: "GARBAGE" }],
] as const) {
  test(`filtro manipulado na URL (${rotulo}) não derruba a página — HTTP 200, sem error boundary`, async ({ page }) => {
    const url = "/app/clientes?filters=" + encodeURIComponent(JSON.stringify(filtro));
    const resposta = await page.goto(url);

    expect(resposta?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    // Nenhuma das telas de erro do Next (dev overlay ou página genérica)
    // apareceu — a página real da tela carregou até o fim.
    await expect(page.getByText("Todos os clientes")).toBeVisible();
  });
}

// Correção cirúrgica pós-auditoria — LOW de acessibilidade: linha da
// tabela agora é uma parada de Tab (tabIndex=0) quando onRowClick existe,
// com Enter/Espaço ativando o mesmo comportamento do clique.
test("linha da tabela abre o drawer por teclado (Enter e Espaço), não só por clique", async ({ page }) => {
  const nomeUnico = `Cliente Teclado E2E ${Date.now()}`;

  await page.goto("/app/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByPlaceholder("Nome", { exact: true }).fill(nomeUnico);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

  await page.getByPlaceholder("Buscar por nome, telefone ou e-mail...").fill(nomeUnico);
  await page.waitForURL(/search=/);
  const linha = page.getByRole("row", { name: new RegExp(nomeUnico) });
  await expect(linha).toBeVisible();
  const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: nomeUnico });
  const drawerTitulo = drawer.getByRole("heading", { name: nomeUnico });

  // Enter — foca a PRÓPRIA linha (não um link/botão aninhado) e ativa.
  await linha.focus();
  await page.keyboard.press("Enter");
  await expect(drawerTitulo).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawerTitulo).not.toBeVisible();

  // Espaço — mesmo comportamento, e não deve rolar a página (preventDefault).
  await linha.focus();
  await page.keyboard.press(" ");
  await expect(drawerTitulo).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawerTitulo).not.toBeVisible();
});

// Enter no link do nome (dentro da linha) navega pra ficha — nunca abre o
// drawer por acidente (mesmo racional do stopPropagation de clique,
// aplicado ao event.target===event.currentTarget do keydown da linha).
test("Enter no link do nome navega pra ficha do cliente, não abre o drawer", async ({ page }) => {
  const nomeUnico = `Cliente Link Teclado E2E ${Date.now()}`;

  await page.goto("/app/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByPlaceholder("Nome", { exact: true }).fill(nomeUnico);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

  await page.getByPlaceholder("Buscar por nome, telefone ou e-mail...").fill(nomeUnico);
  // Mesma espera pela navegação debounced da busca — sem isso, o clique/
  // Enter no link pode competir com a navegação da busca ainda em voo e
  // "perder" a corrida (mesma causa raiz investigada e confirmada nesta
  // correção: o link chega a ser focado e o Enter é processado, mas a
  // navegação do <Link> é abortada pela navegação client-side concorrente
  // disparada pelo debounce da busca).
  await page.waitForURL(/search=/);
  const linkNome = page.getByRole("link", { name: nomeUnico });
  await expect(linkNome).toBeVisible();

  await linkNome.focus();
  await expect(linkNome).toBeFocused();
  await page.keyboard.press("Enter");

  // Sem waitForURL: a navegação do <Link> é client-side (History API), não
  // dispara um novo evento "load" — waitForURL (default waitUntil:"load")
  // ficaria esperando um load que nunca vem. Espera direto pelo conteúdo
  // da ficha (heading com o nome), que só aparece depois da navegação
  // completar de verdade. Timeout maior que o padrão: primeira visita a
  // /app/clientes/[id] neste teste é a primeira vez que essa rota
  // dinâmica compila sob Turbopack dev (cold compile), que sozinho já
  // pode passar de 5s — nada a ver com a interação de teclado em si.
  await expect(page.getByRole("heading", { name: nomeUnico })).toBeVisible({ timeout: 15_000 });
  expect(page.url()).toMatch(/\/app\/clientes\/[^/?]+$/);
});
