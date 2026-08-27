import { test, expect } from "@playwright/test";
import { ORG_A, login } from "./helpers";

// Redesenho de Usuários — roda em ORG_A (owner OWNER, já seedado):
// diferente da Agenda/Pipeline, esta tela não toca em PropertyInterest/
// PropertyInterestStageHistory nem em nenhuma métrica agregada
// compartilhada entre specs — zero risco de contaminação cross-spec,
// então não precisa de organização dedicada.
test.describe("Usuários", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_A);
  });

  test("KPIs renderizam, cadastra usuário pelo Sheet, busca, filtros de papel e status, alterna status", async ({
    page,
  }) => {
    const nomeUnico = `Usuario E2E ${Date.now()}`;
    const emailUnico = `usuario.e2e.${Date.now()}@example.com`;

    await page.goto("/app/usuarios");

    // KPIs — sempre renderizam.
    await expect(page.getByText("Total de usuários", { exact: true })).toBeVisible();
    await expect(page.getByText("Administradores", { exact: true })).toBeVisible();
    await expect(page.getByText("Corretores", { exact: true })).toBeVisible();
    await expect(page.getByText("Ativos", { exact: true })).toBeVisible();

    // Cadastro real — mesmo fluxo do produto (Sheet -> criarUsuario).
    await page.getByRole("button", { name: "Novo usuário" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nomeUnico);
    await page.getByPlaceholder("E-mail", { exact: true }).fill(emailUnico);
    await page.getByPlaceholder("Senha (mín. 6 caracteres)").fill("senha123456");
    // Papel default do form já é "Corretor" (BROKER) — mantém o default,
    // exercitando o caminho mais comum sem precisar abrir o Select.
    await page.getByRole("button", { name: "Cadastrar" }).click();

    // Sheet fecha sozinho (onSuccess) — o próprio fechamento já prova que
    // criarUsuario devolveu sucesso (não redireciona mais, ver actions.ts).
    await expect(page.getByRole("heading", { name: "Novo usuário" })).not.toBeVisible();
    await expect(page.getByText(nomeUnico).first()).toBeVisible();
    await expect(page.getByText(emailUnico).first()).toBeVisible();

    // Busca — sem resultado pra um nome inexistente, com resultado pro
    // nome real.
    await page.getByPlaceholder("Buscar por nome ou e-mail...").fill("Nome Que Nunca Existe Zzz");
    await page.waitForTimeout(500); // debounce de 400ms do próprio DataTable, não um sleep de isolamento.
    // .first(): mesma dualidade tabela/cards mobile do teste de estado
    // vazio abaixo — ver comentário lá.
    await expect(page.getByText("Nenhum usuário encontrado com esses filtros.").first()).toBeVisible();
    await page.getByPlaceholder("Buscar por nome ou e-mail...").fill(nomeUnico);
    await page.waitForTimeout(500);
    await expect(page.getByText(nomeUnico).first()).toBeVisible();

    // Filtro de papel — o usuário recém-criado é BROKER (Corretor).
    await page.getByLabel("Papel").selectOption("ADMIN");
    await expect(page.getByText(nomeUnico)).not.toBeVisible();
    await page.getByLabel("Papel").selectOption("__todos__");
    await page.getByPlaceholder("Buscar por nome ou e-mail...").fill(nomeUnico);
    await page.waitForTimeout(500);
    await expect(page.getByText(nomeUnico).first()).toBeVisible();

    // Status inicial é Ativo — alterna pra Suspenso pela ação rápida da
    // linha (alternarStatusUsuario), sem passar pelo formulário completo.
    const linha = page.getByRole("row", { name: new RegExp(nomeUnico) });
    await expect(linha.getByText("Ativo", { exact: true })).toBeVisible();
    await linha.getByRole("button", { name: "Desativar" }).click();
    await expect(linha.getByText("Suspenso", { exact: true })).toBeVisible();
    await expect(linha.getByRole("button", { name: "Ativar" })).toBeVisible();

    // Filtro de status — Suspenso mostra o usuário, Ativo esconde.
    await page.getByLabel("Status").selectOption("SUSPENDED");
    await expect(page.getByText(nomeUnico).first()).toBeVisible();
    await page.getByLabel("Status").selectOption("ACTIVE");
    await expect(page.getByText(nomeUnico)).not.toBeVisible();
  });

  // Auto-proteção (actions.ts): o próprio usuário logado nunca vê um
  // botão de ativar/desativar na própria linha — só "Você". Linha
  // localizada pelo e-mail de login (ORG_A.email) — o nome do owner
  // seedado é o próprio nome da organização ("Organização E2E A"), não
  // um valor fixo tipo "Administrador".
  test("linha do próprio usuário logado mostra 'Você', sem ação de status", async ({ page }) => {
    await page.goto("/app/usuarios");
    const linhaPropria = page.getByRole("row", { name: new RegExp(ORG_A.email) });
    await expect(linhaPropria.getByText("Você", { exact: true })).toBeVisible();
    await expect(linhaPropria.getByRole("button", { name: /Ativar|Desativar/ })).not.toBeVisible();
  });

  // Estado vazio — busca sem resultado mostra mensagem neutra, nunca um
  // erro, independente de quantos usuários já existam de execuções
  // anteriores (o seed nunca limpa User/OrganizationMember entre specs).
  test("estado vazio: busca sem resultado mostra mensagem neutra, sem erro", async ({ page }) => {
    await page.goto("/app/usuarios");
    await page.getByPlaceholder("Buscar por nome ou e-mail...").fill("Nome Que Nunca Existe Zzz Vazio");
    await page.waitForTimeout(500);
    // .first(): responsividade do painel administrativo — DataTable agora
    // recebe `cards` pra este listing (mesma correção de Imóveis), então a
    // mensagem vazia renderiza tanto na tabela desktop (visível, oculta só
    // por CSS em viewport padrão) quanto no bloco de cards mobile (oculto
    // via `md:hidden`, mas presente no DOM) — mesmo racional já usado no
    // teste equivalente de imoveis.spec.ts.
    await expect(page.getByText("Nenhum usuário encontrado com esses filtros.").first()).toBeVisible();
  });

  // Mobile 375px — sem overflow horizontal do documento.
  test("375px: sem overflow horizontal do documento", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/app/usuarios");
    const semOverflowHorizontal = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(semOverflowHorizontal).toBe(true);
  });

  // Correção do Finding #2 (auditoria pré-commit) — o overflow só
  // aparecia com um FILTRO ativo (o botão "Limpar filtros" só existe
  // nesse estado), nunca na tabela vazia/sem filtro — por isso o teste
  // acima (375px puro) nunca pegou. Cobre 360px explicitamente (a
  // auditoria mediu 363 vs 360 ali) com papel, status, papel+status e
  // com o Sheet de criação aberto por cima.
  test("360px com filtros ativos (papel, status, papel+status) e Sheet aberto: sem overflow horizontal", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/app/usuarios");

    async function semOverflow() {
      return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    }

    await page.getByLabel("Papel").selectOption("BROKER");
    await page.waitForTimeout(200);
    await expect(page.getByRole("button", { name: "Limpar filtros" })).toBeVisible();
    expect(await semOverflow(), "overflow com filtro de papel ativo").toBe(true);

    await page.getByLabel("Status").selectOption("ACTIVE");
    await page.waitForTimeout(200);
    expect(await semOverflow(), "overflow com papel + status ativos").toBe(true);

    await page.getByLabel("Papel").selectOption("__todos__");
    await page.waitForTimeout(200);
    expect(await semOverflow(), "overflow só com status ativo").toBe(true);

    await page.getByRole("button", { name: "Novo usuário" }).click();
    await expect(page.getByRole("heading", { name: "Novo usuário" })).toBeVisible();
    expect(await semOverflow(), "overflow com filtro + Sheet aberto").toBe(true);
  });

  // Correção do Finding #1 (auditoria pré-commit) — a coluna "Usuário"
  // funde nome+e-mail, mas o cabeçalho ganhou dois alvos de ordenação
  // independentes (UsuarioColunaOrdenacao). Prova que ordenar por e-mail
  // volta a ser possível pela UI (não só editando a URL), que asc/desc
  // funcionam nos dois campos, e que um filtro/busca ativos sobrevivem à
  // navegação de sort.
  test("ordena por Nome e por E-mail pela UI (cabeçalho da coluna Usuário), preservando filtros", async ({
    page,
  }) => {
    const ts = Date.now();
    const marcador = `Alfabetico${ts}`;
    const usuarioZ = { nome: `Zzz Usuario Ultimo ${marcador}`, email: `aaa.primeiro.${ts}@example.com` };
    const usuarioA = { nome: `Aaa Usuario Primeiro ${marcador}`, email: `zzz.ultimo.${ts}@example.com` };

    await page.goto("/app/usuarios");
    for (const u of [usuarioZ, usuarioA]) {
      await page.getByRole("button", { name: "Novo usuário" }).click();
      await page.getByPlaceholder("Nome", { exact: true }).fill(u.nome);
      await page.getByPlaceholder("E-mail", { exact: true }).fill(u.email);
      await page.getByPlaceholder("Senha (mín. 6 caracteres)").fill("senha123456");
      await page.getByRole("button", { name: "Cadastrar" }).click();
      await expect(page.getByRole("heading", { name: "Novo usuário" })).not.toBeVisible();
    }

    // Isola os 2 usuários recém-criados via busca (marcador único por
    // execução, evita colidir com usuários de outras rodadas deste mesmo
    // teste já acumulados no banco de teste), pra comparar só a ordem
    // entre eles. Espera a navegação do debounce (400ms, DataTable) de
    // fato aterrissar na URL antes de clicar em ordenar — senão o clique
    // de sort pode capturar um `searchParams` ainda sem `search=...` (a
    // busca e o sort são duas navegações client-side independentes) e
    // undoing o filtro de busca por engano.
    await page.getByPlaceholder("Buscar por nome ou e-mail...").fill(marcador);
    await page.waitForURL(new RegExp(`search=${marcador}`));

    async function ordem() {
      const linhas = await page.locator("tbody tr").allTextContents();
      return linhas.map((l) => (l.includes(usuarioZ.nome) ? "Z" : l.includes(usuarioA.nome) ? "A" : "?"));
    }

    // expect.poll (não um sleep fixo): a URL muda otimisticamente antes
    // do Server Component terminar de buscar/renderizar a nova ordem —
    // espera até a tabela realmente refletir o novo `sort`, sem inflar
    // timeout artificialmente pro caso comum (rápido).

    // "Nome" ascendente: Aaa... (A) antes de Zzz... (Z).
    await page.getByRole("button", { name: /Ordenar por Nome/ }).click();
    await page.waitForURL(/sort=nome%3Aasc/);
    await expect.poll(ordem, { timeout: 10000 }).toEqual(["A", "Z"]);

    // "Nome" de novo -> descendente.
    await page.getByRole("button", { name: /Ordenar por Nome/ }).click();
    await page.waitForURL(/sort=nome%3Adesc/);
    await expect.poll(ordem, { timeout: 10000 }).toEqual(["Z", "A"]);

    // "E-mail" ascendente: aaa...@ (Z, o usuário "Zzz" tem o e-mail que
    // começa com "aaa") antes de zzz...@ (A) — prova que a ordenação é
    // por e-mail de verdade, não uma cópia disfarçada da de nome.
    await page.getByRole("button", { name: /Ordenar por E-mail/ }).click();
    await page.waitForURL(/sort=email%3Aasc/);
    await expect.poll(ordem, { timeout: 10000 }).toEqual(["Z", "A"]);

    // "E-mail" de novo -> descendente.
    await page.getByRole("button", { name: /Ordenar por E-mail/ }).click();
    await page.waitForURL(/sort=email%3Adesc/);
    await expect.poll(ordem, { timeout: 10000 }).toEqual(["A", "Z"]);

    // Busca continua aplicada durante toda a navegação de sort.
    await expect(page.getByPlaceholder("Buscar por nome ou e-mail...")).toHaveValue(marcador);
  });

  test("filtro de papel na URL sobrevive a um clique em 'Ordenar por E-mail'", async ({ page }) => {
    await page.goto("/app/usuarios?filters=" + encodeURIComponent(JSON.stringify({ papel: "OWNER" })));
    await page.getByRole("button", { name: /Ordenar por E-mail/ }).click();
    await page.waitForURL(/sort=email/);
    expect(page.url()).toContain(encodeURIComponent(JSON.stringify({ papel: "OWNER" })));
    await expect(page.getByLabel("Papel")).toHaveValue("OWNER");
  });

  // Correção do Finding #3 (auditoria pré-commit) — parsing defensivo de
  // `filters` no client. Um valor não-string manipulado na URL (array,
  // objeto, número) não pode mais chegar ao <select> controlado: cai no
  // estado neutro "__todos__", sem warning de React sobre `value`
  // não-escalar e sem quebrar a página.
  test("filters adversarial (status/papel não-string na URL) cai em estado neutro, sem warning nem crash", async ({
    page,
  }) => {
    const avisos: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") avisos.push(msg.text());
    });

    const casos = [
      { status: ["ACTIVE", "SUSPENDED"] },
      { status: { $ne: null } },
      { status: 123 },
      { papel: [] },
      { papel: {} },
      { papel: "INVALID_ROLE" },
      { status: "INVALID_STATUS" },
    ];

    for (const filtro of casos) {
      const resp = await page.goto(`/app/usuarios?filters=${encodeURIComponent(JSON.stringify(filtro))}`);
      expect(resp?.status()).toBe(200);
      await expect(page.getByLabel("Papel")).toHaveValue("__todos__");
      await expect(page.getByLabel("Status")).toHaveValue("__todos__");
    }

    const avisosDeSelectValue = avisos.filter((a) => a.includes("value prop") || a.includes("scalar value"));
    expect(avisosDeSelectValue, JSON.stringify(avisos)).toEqual([]);
  });
});
