import { test, expect } from "@playwright/test";
import { ORG_AGENDA, login } from "./helpers";

// Roda numa Organization dedicada (ORG_AGENDA — ver prisma/seed-e2e.ts e
// tests/e2e/helpers.ts), nunca em ORG_A: criarAgendamentoVisita avança
// PropertyInterest.stage de INTERESTED -> VISIT_SCHEDULED na primeira
// visita, gravando um episódio em PropertyInterestStageHistory que
// src/lib/pipeline.ts usa pra calcular a média histórica GLOBAL da
// organização (tempoMedioHistorico) — se este spec rodasse na mesma
// organização de pipeline.spec.ts, esse episódio contaminaria a
// classificação de prioridade de uma negociação criada por aquele outro
// spec (achado real da auditoria pré-commit, com reprodução em worktree
// descartável). Organização própria elimina esse vetor por construção
// (buscarAnalyticsHistoricoPipeline sempre filtra por organizationId),
// não por temporização — por isso este arquivo não usa/precisa de
// nenhum waitForTimeout artificial pra esse fim.
const TITULO_IMOVEL_AGENDA = "Apartamento E2E Agenda";

// Redesenho da Agenda — fluxo completo: cria um cliente, relaciona um
// imóvel (RelacionarImovelForm) e agenda uma visita a partir do
// PropertyInterest recém-criado (criarAgendamentoVisita, já existente —
// nenhum atalho de banco, mesmo fluxo real do produto). Agenda pra mais
// tarde HOJE (não amanhã) de propósito: exercita a aba "Hoje", o KPI
// "Hoje" e — crucialmente — mantém o card/drawer MONTADO depois de
// remarcar (ver horarioFuturoHojeDiferenteDe abaixo): revalidatePath
// re-renderiza page.tsx a cada Server Action, e a busca (`q=nomeUnico`)
// continua ativa na URL durante a etapa de remarcar/concluir — se o novo
// scheduledAt caísse fora da janela da aba atual (Hoje) o item sumiria da
// lista filtrada e o <AgendaItemCard>/<AgendaDetalhesDrawer> desmontariam
// no meio do fluxo (bug real encontrado e corrigido nesta rodada, ao
// tentar uma primeira versão do fix que remarcava pra "amanhã").
// "Daqui a `minutos`", mas nunca cruzando a virada do dia UTC (a
// classificação Hoje/Próximas de src/lib/scheduled-activity-date.ts é
// por dia calendário UTC-literal, não por deslocamento de horário) —
// perto da meia-noite UTC, um deslocamento grande rolaria pra amanhã e
// o teste acabaria testando a aba errada. Fica no máximo em 23:59 de
// hoje.
function formatarISOMinuto(alvo: Date): string {
  const ano = alvo.getUTCFullYear();
  const mes = String(alvo.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(alvo.getUTCDate()).padStart(2, "0");
  const hora = String(alvo.getUTCHours()).padStart(2, "0");
  const minuto = String(alvo.getUTCMinutes()).padStart(2, "0");
  return `${ano}-${mes}-${dia}T${hora}:${minuto}`;
}

function horarioMaisTardeHoje(minutos: number): string {
  const agora = new Date();
  const fimDeHojeUTC = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 23, 59, 0, 0)
  );
  const daquiXmin = new Date(agora.getTime() + minutos * 60 * 1000);
  const alvo = daquiXmin.getTime() < fimDeHojeUTC.getTime() ? daquiXmin : fimDeHojeUTC;
  return formatarISOMinuto(alvo);
}

// Horário de remarcação — SEMPRE avaliado no momento em que é chamado
// (nunca derivado de um valor calculado cedo no teste): entre criar a
// visita e remarcá-la, o teste passa por vários passos reais de UI
// (checar KPIs, buscar, abrir o drawer), consumindo segundos reais de
// relógio — perto da virada do dia UTC, um valor "1 minuto antes da
// criação" calculado no início do teste podia já estar no PASSADO por
// quando a remarcação era de fato submetida (bug real encontrado:
// "A nova data deve ser no futuro."). Mesmo clamp de horarioMaisTardeHoje
// (nunca cruza a virada do dia), mas nunca igual a `evitar`: se a
// primeira tentativa colidir (ambos os valores caindo no mesmo teto de
// 23:59), tenta 1 minuto antes do teto — e só aceita a colisão como
// último recurso se isso já não for mais estritamente futuro (janela
// residual de bem menos de 1 minuto antes da meia-noite UTC,
// extremamente rara).
function horarioFuturoHojeDiferenteDe(minutos: number, evitar: string): string {
  const agora = new Date();
  const fimDeHojeUTC = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 23, 59, 0, 0)
  );
  const daquiXmin = new Date(agora.getTime() + minutos * 60 * 1000);
  let alvo = daquiXmin.getTime() < fimDeHojeUTC.getTime() ? daquiXmin : fimDeHojeUTC;
  if (formatarISOMinuto(alvo) === evitar) {
    const candidato = new Date(alvo.getTime() - 60_000);
    if (candidato.getTime() > agora.getTime()) alvo = candidato;
  }
  return formatarISOMinuto(alvo);
}

test.describe("Agenda", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ORG_AGENDA);
  });

  test("KPIs renderizam, agenda visita, aparece em Hoje, filtro, abre detalhes, remarca, conclui, aparece em Anteriores", async ({
    page,
  }) => {
    const nomeUnico = `Agenda E2E ${Date.now()}`;
    const telefoneUnico = `119${String(Date.now()).slice(-8)}`;

    // Cria o cliente, relaciona o imóvel seedado e agenda a visita —
    // mesmo fluxo real do produto (RelacionarImovelForm + AgendamentoVisita).
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    await page.getByPlaceholder("Nome", { exact: true }).fill(nomeUnico);
    await page.getByPlaceholder("Telefone/WhatsApp").fill(telefoneUnico);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).not.toBeVisible();

    await page.getByPlaceholder("Buscar por nome, telefone ou e-mail...").fill(nomeUnico);
    await page.waitForURL(/search=/);
    await page.getByRole("row", { name: new RegExp(nomeUnico) }).getByText("Novo lead").click();
    await page
      .locator('[data-slot="sheet-content"]')
      .filter({ hasText: nomeUnico })
      .getByRole("button", { name: "Ver perfil completo" })
      .click();
    await page.waitForURL(/\/app\/clientes\/.+/);

    // Título fixo (não dinâmico): imovelOrgAgenda pertence só a
    // ORG_AGENDA, nenhum outro spec o toca ou renomeia (diferente de
    // imovelParaEditarOrgA, compartilhado por imoveis.spec.ts/
    // pipeline.spec.ts/clientes.spec.ts em ORG_A).
    await page.getByRole("combobox", { name: "Imóvel" }).click();
    await page.getByRole("option", { name: TITULO_IMOVEL_AGENDA }).click();
    await page.getByRole("button", { name: "Relacionar imóvel" }).click();
    await expect(page.getByText(TITULO_IMOVEL_AGENDA).first()).toBeVisible();

    const horarioCriacao = horarioMaisTardeHoje(10);
    await page.getByRole("button", { name: "Agendar visita" }).click();
    await page.locator('input[name="scheduledAt"]').fill(horarioCriacao);
    await page.getByRole("button", { name: "Agendar", exact: true }).click();
    await expect(page.getByText(/^Próxima visita:/)).toBeVisible();

    // KPIs — sempre renderizam, agora em qualquer aba.
    await page.goto("/app/agenda");
    await expect(page.getByText("Hoje", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Próximas", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Atrasadas", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Concluídas", { exact: true }).first()).toBeVisible();

    // Card aparece na aba "Hoje" (agendada pra mais tarde hoje). `.last()`
    // porque o painel "Agora" (PainelAgoraAgenda), que aparece ANTES da
    // lista de cards, também mostra o nome do cliente combinado com o
    // horário no mesmo parágrafo ("23:59 · Agenda E2E...") — substring
    // match do getByText casa com os dois, o card em si é sempre o
    // último.
    await expect(page.getByText(nomeUnico).last()).toBeVisible();
    await expect(page.getByText(TITULO_IMOVEL_AGENDA).last()).toBeVisible();
    await expect(page.getByText("Agendada", { exact: true }).first()).toBeVisible();

    // Busca — sem resultado pra um nome inexistente, com resultado pro
    // nome real.
    await page.getByPlaceholder("Buscar cliente ou imóvel...").fill("Nome Que Nunca Existe Zzz");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText("Nenhuma visita encontrada com esses filtros.")).toBeVisible();
    await page.getByPlaceholder("Buscar cliente ou imóvel...").fill(nomeUnico);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText(nomeUnico).last()).toBeVisible();

    // Abre os detalhes — drawer mostra os mesmos dados do card.
    await page.getByRole("button", { name: "Ver detalhes" }).click();
    const drawer = page.locator('[data-slot="sheet-content"]').filter({ hasText: nomeUnico });
    await expect(drawer.getByRole("heading", { name: "Visita" })).toBeVisible();
    await expect(drawer.getByText(TITULO_IMOVEL_AGENDA)).toBeVisible();

    // Remarca (ainda hoje ou não, tanto faz — só confirma que a Server
    // Action real de remarcar funciona a partir do drawer).
    await drawer.getByRole("button", { name: "Remarcar" }).click();
    await drawer.locator('input[name="scheduledAt"]').fill(horarioFuturoHojeDiferenteDe(2, horarioCriacao));
    await drawer.getByRole("button", { name: "Salvar nova data" }).click();
    await expect(drawer.getByText("Salvando...")).not.toBeVisible({ timeout: 10000 });

    // Conclui — some da aba atual e passa a aparecer em "Anteriores"
    // como Concluída; o KPI "Concluídas" (hoje) reflete isso porque a
    // visita foi agendada pra hoje.
    await drawer.getByRole("button", { name: "Marcar como realizada" }).click();
    await expect(drawer.getByText("Salvando...")).not.toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: /^Anteriores/ }).click();
    await expect(page.getByText(nomeUnico)).toBeVisible();
    await expect(page.getByText("Concluída", { exact: true }).first()).toBeVisible();
  });

  // Estados vazios — busca sem resultado, independente de quantos
  // compromissos já existam de execuções anteriores (Person/
  // ScheduledActivity só são limpos no global-setup do seed).
  test("estados vazios: busca sem resultado mostra mensagem neutra, sem erro", async ({ page }) => {
    for (const aba of ["hoje", "proximas", "anteriores"]) {
      await page.goto(`/app/agenda?aba=${aba}`);
      await page.getByPlaceholder("Buscar cliente ou imóvel...").fill("Nome Que Nunca Existe Zzz Vazio");
      await page.getByRole("button", { name: "Filtrar" }).click();
      await expect(page.getByText("Nenhuma visita encontrada com esses filtros.")).toBeVisible();
    }
  });

  // Mobile 375px — sem overflow horizontal do documento, nas 3 abas.
  test("375px: sem overflow horizontal do documento", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    for (const aba of ["hoje", "proximas", "anteriores"]) {
      await page.goto(`/app/agenda?aba=${aba}`);
      const semOverflowHorizontal = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(semOverflowHorizontal).toBe(true);
    }
  });
});
