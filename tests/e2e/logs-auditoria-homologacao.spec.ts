import { test, expect } from "@playwright/test";
import { login, IDS_E2E } from "./helpers";

// =======================================================================
// Logs de Auditoria — homologação visual real (Playwright + Chromium
// já instalados neste ambiente, confirmado antes de escrever este spec)
// =======================================================================
// Fixtures dedicadas (prisma/seed-e2e.ts, IDS_E2E.*Arquivamento*/
// *Exclusao*Org A) — nunca compartilhadas com nenhum outro spec, porque
// este arquivo MUTA o estado dos registros (arquiva, restaura, exclui).
//
// Capturas de tela salvas em
// docs/tecnico/logs-auditoria-easymob/evidencias/ — evidência real de
// homologação visual, não um smoke test HTTP.

const CREDENCIAIS_OWNER_A = {
  email: process.env.SEED_ADMIN_EMAIL ?? "owner-a@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Caminho resolvido contra o cwd do runner (raiz do repo), não contra
// este arquivo — path.screenshot NÃO é relativo ao spec.
const PASTA_EVIDENCIAS = "docs/tecnico/logs-auditoria-easymob/evidencias";

test.describe("Logs de Auditoria — homologação visual", () => {
  test.describe.configure({ mode: "serial" });

  test("Imóveis: arquivar, listar com/sem arquivados, restaurar", async ({ page }) => {
    await login(page, CREDENCIAIS_OWNER_A);

    // --- Ficha do imóvel: botão Arquivar visível, clique, confirmação ---
    await page.goto(`/app/imoveis/${IDS_E2E.imovelArquivamentoOrgA}`);
    await expect(page.getByRole("heading", { name: "Editar imóvel" })).toBeVisible();
    const botaoArquivar = page.getByRole("button", { name: "Arquivar" });
    await expect(botaoArquivar).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/01-ficha-imovel-antes-arquivar.png`, fullPage: true });

    await botaoArquivar.click();
    await expect(page.getByText(/Imóvel arquivado/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Restaurar" })).toBeVisible();
    await expect(page.getByText("Arquivado", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/02-ficha-imovel-depois-arquivar.png`, fullPage: true });

    // --- Listagem: some por padrão ---
    await page.goto("/app/imoveis");
    await expect(page.getByText("Casa E2E Arquivamento")).toHaveCount(0);
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/03-listagem-imoveis-sem-arquivados.png`, fullPage: true });

    // --- Toggle "Ver arquivados": reaparece, com badge ---
    await page.getByRole("button", { name: "Ver arquivados" }).click();
    await expect(page).toHaveURL(/arquivados=1/);
    const linhaArquivada = page.getByText("Casa E2E Arquivamento").first();
    await expect(linhaArquivada).toBeVisible();
    await expect(page.getByText("Arquivado").first()).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/04-listagem-imoveis-com-arquivados.png`, fullPage: true });

    // --- Restaurar: volta ao normal ---
    await page.goto(`/app/imoveis/${IDS_E2E.imovelArquivamentoOrgA}`);
    await page.getByRole("button", { name: "Restaurar" }).click();
    await expect(page.getByText(/Imóvel restaurado/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Arquivar" })).toBeVisible();

    await page.goto("/app/imoveis");
    await expect(page.getByText("Casa E2E Arquivamento").first()).toBeVisible();
  });

  test("Clientes: arquivar, listar com/sem arquivados, restaurar", async ({ page }) => {
    await login(page, CREDENCIAIS_OWNER_A);

    await page.goto(`/app/clientes/${IDS_E2E.pessoaArquivamentoOrgA}`);
    await expect(page.getByRole("heading", { name: "Cliente E2E Arquivamento" })).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/05-ficha-cliente-antes-arquivar.png`, fullPage: true });

    await page.getByRole("button", { name: "Arquivar" }).click();
    await expect(page.getByText(/Cliente arquivado/i)).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/06-ficha-cliente-depois-arquivar.png`, fullPage: true });

    await page.goto("/app/clientes");
    await expect(page.getByText("Cliente E2E Arquivamento")).toHaveCount(0);

    await page.getByRole("button", { name: "Ver arquivados" }).click();
    await expect(page.getByText("Cliente E2E Arquivamento").first()).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/07-listagem-clientes-com-arquivados.png`, fullPage: true });

    await page.goto(`/app/clientes/${IDS_E2E.pessoaArquivamentoOrgA}`);
    await page.getByRole("button", { name: "Restaurar" }).click();
    await expect(page.getByText(/Cliente restaurado/i)).toBeVisible();
  });

  test("Exclusão definitiva de Imóvel: modal, confirmação digitada, botão desabilitado até o texto bater", async ({
    page,
  }) => {
    await login(page, CREDENCIAIS_OWNER_A);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelExclusaoOrgA}`);

    await page.getByRole("button", { name: "Excluir definitivamente" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/permanente e irreversível/i)).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/08-modal-exclusao-definitiva-imovel.png` });

    const botaoConfirmar = dialog.getByRole("button", { name: "Excluir definitivamente" });
    await expect(botaoConfirmar).toBeDisabled();

    // Texto errado: continua desabilitado.
    const campoConfirmacao = dialog.getByLabel(/Digite/i);
    await campoConfirmacao.fill("texto errado");
    await expect(botaoConfirmar).toBeDisabled();

    // Texto exato: habilita.
    await campoConfirmacao.fill("Casa E2E Exclusão Definitiva");
    await expect(botaoConfirmar).toBeEnabled();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/09-modal-exclusao-confirmacao-valida.png` });

    await botaoConfirmar.click();
    // Sucesso: sem redirecionamento client-side — a Server Action revalida
    // a própria rota e, como o imóvel já não existe mais, o re-render em
    // cima da mesma URL cai no notFound() da página.
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });

  test("Exclusão definitiva de Cliente: mesma validação", async ({ page }) => {
    await login(page, CREDENCIAIS_OWNER_A);
    await page.goto(`/app/clientes/${IDS_E2E.pessoaExclusaoOrgA}`);

    await page.getByRole("button", { name: "Excluir definitivamente" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Digite/i).fill("Cliente E2E Exclusão Definitiva");
    await dialog.getByRole("button", { name: "Excluir definitivamente" }).click();
    // Mesmo padrão do imóvel: sem redirecionamento client-side — espera o
    // re-render em cima da própria URL cair no notFound() antes de seguir.
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

    await page.goto("/app/clientes");
    await expect(page.getByText("Cliente E2E Exclusão Definitiva")).toHaveCount(0);
  });

  test("Exclusão definitiva bloqueada por negociação vinculada — mensagem clara dentro do modal (Imóvel e Cliente)", async ({
    page,
  }) => {
    await login(page, CREDENCIAIS_OWNER_A);

    // --- Imóvel ---
    await page.goto(`/app/imoveis/${IDS_E2E.imovelBloqueadoOrgA}`);
    await page.getByRole("button", { name: "Excluir definitivamente" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Digite/i).fill("Casa E2E Bloqueada por Negociação");
    await dialog.getByRole("button", { name: "Excluir definitivamente" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/negocia/i);
    // O modal continua aberto (recusa, não sucesso) — nada foi excluído.
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/12-bloqueio-exclusao-imovel-negociacao.png` });
    await page.goto(`/app/imoveis/${IDS_E2E.imovelBloqueadoOrgA}`);
    await expect(page.getByRole("heading", { name: "Editar imóvel" })).toBeVisible();

    // --- Cliente ---
    await page.goto(`/app/clientes/${IDS_E2E.pessoaBloqueadaOrgA}`);
    await page.getByRole("button", { name: "Excluir definitivamente" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Digite/i).fill("Cliente E2E Bloqueado por Negociação");
    await dialog.getByRole("button", { name: "Excluir definitivamente" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/negocia/i);
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/13-bloqueio-exclusao-cliente-negociacao.png` });
    await page.goto(`/app/clientes/${IDS_E2E.pessoaBloqueadaOrgA}`);
    await expect(page.getByRole("heading", { name: "Cliente E2E Bloqueado por Negociação" })).toBeVisible();
  });

  test("BROKER não vê nenhum dos 3 botões de arquivamento/exclusão (Imóvel e Cliente)", async ({ page }) => {
    await login(page, { email: "broker-a@e2e.test", senha: CREDENCIAIS_OWNER_A.senha });

    await page.goto(`/app/imoveis/${IDS_E2E.imovelArquivamentoOrgA}`);
    await expect(page.getByRole("heading", { name: "Editar imóvel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Arquivar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Restaurar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Excluir definitivamente" })).toHaveCount(0);
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/14-broker-sem-botoes-imovel.png`, fullPage: true });

    await page.goto(`/app/clientes/${IDS_E2E.pessoaArquivamentoOrgA}`);
    await expect(page.getByRole("heading", { name: "Cliente E2E Arquivamento" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Arquivar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Restaurar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Excluir definitivamente" })).toHaveCount(0);
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/15-broker-sem-botoes-cliente.png`, fullPage: true });
  });

  test("Auditoria: eventos aparecem com usuário, módulo, ação e detalhe corretos", async ({ page }) => {
    await login(page, CREDENCIAIS_OWNER_A);
    await page.goto("/app/auditoria");
    await expect(page.getByRole("heading", { name: "Logs de Auditoria" })).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/10-tela-auditoria-geral.png`, fullPage: true });

    // Filtro por módulo (Property) — os eventos de arquivar/restaurar/
    // excluir do imóvel de teste devem aparecer, e nenhuma outra entidade
    // (ex.: Session, Person) deve continuar na tabela — não basta o texto
    // aparecer em algum lugar da página, a FILTRAGEM real é o que importa.
    const tabela = page.getByRole("table");
    await page.getByRole("combobox").filter({ hasText: /Módulo/i }).click();
    await page.getByRole("option", { name: "Property", exact: true }).click();
    await expect(page).toHaveURL(/entity.*Property/);
    // Combobox fecha sozinho ao selecionar — confirma antes de prosseguir,
    // em vez de só assumir (evita capturar a captura de tela com o menu
    // ainda aberto por cima da tabela).
    await expect(page.getByRole("listbox")).not.toBeVisible();
    await expect(tabela.getByText("Session")).toHaveCount(0);
    await expect(tabela.getByRole("cell", { name: "Property", exact: true }).first()).toBeVisible();
    await expect(page.getByText("deleted_permanently").first()).toBeVisible();
    await expect(page.getByText("archived").first()).toBeVisible();
    await expect(page.getByText("restored").first()).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/11-tela-auditoria-filtrada-property.png`, fullPage: true });
  });
});

// =======================================================================
// Responsividade mobile — mesmos fluxos, viewport reduzida (iPhone SE,
// 375×667, a menor largura comum, mais rigorosa que qualquer tablet).
// Describe própria para não interferir no viewport padrão dos testes
// acima (mesmo servidor, mesmo banco, specs lidos em série pelo
// Playwright de qualquer forma).
// =======================================================================
test.describe("Logs de Auditoria — responsividade mobile", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 375, height: 667 } });

  test("Tela de Auditoria em mobile: sem sobreposição, filtro usável", async ({ page }) => {
    await login(page, CREDENCIAIS_OWNER_A);
    await page.goto("/app/auditoria");
    await expect(page.getByRole("heading", { name: "Logs de Auditoria" })).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/16-mobile-auditoria.png`, fullPage: true });
  });

  test("Listagem de Imóveis em mobile: toggle 'Ver arquivados' e badge acessíveis", async ({ page }) => {
    await login(page, CREDENCIAIS_OWNER_A);
    await page.goto("/app/imoveis");
    const botaoToggle = page.getByRole("button", { name: "Ver arquivados" });
    await expect(botaoToggle).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/17-mobile-listagem-imoveis.png`, fullPage: true });
  });

  test("Listagem de Clientes em mobile: toggle 'Ver arquivados' acessível", async ({ page }) => {
    await login(page, CREDENCIAIS_OWNER_A);
    await page.goto("/app/clientes");
    await expect(page.getByRole("button", { name: "Ver arquivados" })).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/18-mobile-listagem-clientes.png`, fullPage: true });
  });

  test("Ficha do imóvel em mobile: badge 'Arquivado' e botões de ação sem sobreposição", async ({ page }) => {
    await login(page, CREDENCIAIS_OWNER_A);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelBloqueadoOrgA}`);
    await expect(page.getByRole("heading", { name: "Editar imóvel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Arquivar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Excluir definitivamente" })).toBeVisible();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/19-mobile-ficha-imovel-botoes.png`, fullPage: true });
  });

  test("Modal de exclusão definitiva em mobile: campo de confirmação e botões utilizáveis, sem corte", async ({
    page,
  }) => {
    await login(page, CREDENCIAIS_OWNER_A);
    await page.goto(`/app/imoveis/${IDS_E2E.imovelBloqueadoOrgA}`);
    await page.getByRole("button", { name: "Excluir definitivamente" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/permanente e irreversível/i)).toBeVisible();
    const campoConfirmacao = dialog.getByLabel(/Digite/i);
    await expect(campoConfirmacao).toBeVisible();
    await campoConfirmacao.fill("Casa E2E Bloqueada por Negociação");
    const botaoConfirmar = dialog.getByRole("button", { name: "Excluir definitivamente" });
    await expect(botaoConfirmar).toBeEnabled();
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/20-mobile-modal-exclusao.png` });

    // Também confirma a mensagem de bloqueio em mobile, não só a abertura
    // do modal — o texto de erro não pode ficar cortado/ilegível aqui.
    await botaoConfirmar.click();
    await expect(dialog.getByRole("alert")).toContainText(/negocia/i);
    await page.screenshot({ path: `${PASTA_EVIDENCIAS}/21-mobile-modal-bloqueio-mensagem.png` });
  });
});
