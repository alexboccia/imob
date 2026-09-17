import path from "node:path";
import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";

// Credenciais do seed determinístico (prisma/seed-e2e.ts) — lidas do mesmo
// .env.test que o seed usa, pra nunca divergir entre o dado seedado e o
// valor que o spec tenta logar.
export const ORG_A = {
  slug: process.env.ORG_SLUG ?? "e2e-org-a",
  email: process.env.SEED_ADMIN_EMAIL ?? "owner-a@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

export const ORG_B = {
  slug: "e2e-org-b",
  email: "owner-b@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Organização dedicada a agenda.spec.ts — nunca compartilhada com nenhum
// outro spec, especificamente pra isolar estruturalmente a métrica
// agregada que src/lib/pipeline.ts calcula sobre TODO o
// PropertyInterestStageHistory de uma organização (ver comentário em
// prisma/seed-e2e.ts, seção "Organização C").
export const ORG_AGENDA = {
  slug: "e2e-org-agenda",
  email: "owner-agenda@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Analytics comercial (Fase 5) — organização dedicada, pelo mesmo motivo
// estrutural de ORG_AGENDA: as asserções do Analytics são números
// absolutos, e Org A recebe contatos reais de public-form.spec.ts.
export const ORG_ANALYTICS = {
  slug: "e2e-org-analytics",
  email: "owner-analytics@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Central de trabalho (Fase 17) — organização dedicada, pelo mesmo motivo
// estrutural de ORG_AGENDA/ORG_ANALYTICS: a Home afirma números
// absolutos e pessoais, e o seed dela precisa ser imune à ordem de
// execução dos outros specs.
export const ORG_CENTRAL = {
  slug: "e2e-org-central",
  email: "owner-central@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 21 — o SEGUNDO corretor da Organização E, papel BROKER. Existe
// para provar o lado negativo da visão de equipe: sem autoridade
// gerencial, o alternador não aparece e `?visao=equipe` não revela nada.
export const ORG_CENTRAL_CORRETOR = {
  slug: "e2e-org-central",
  email: "corretor-central@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fuso horário (Fase 18) — organização dedicada e a ÚNICA do seed fora de
// UTC (America/Sao_Paulo). Existe para provar a borda de dia: uma visita
// das 23:30 locais pertence a hoje mesmo já sendo o dia seguinte em UTC.
export const ORG_FUSO = {
  slug: "e2e-org-fuso",
  email: "owner-fuso@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 22 — Organização G, a única do seed com política RESTRITA. Ana e
// Bruno são BROKER com carteiras separadas, e há um cliente
// compartilhado entre os dois.
// Fase 25 — Organização I: dedicada ao ciclo de acesso (convite,
// ativação, recuperação de senha). Dedicada porque os specs desta fase
// TROCAM senha e suspendem vínculos — usar credenciais compartilhadas
// derrubaria o login de todos os outros specs.
export const ORG_ACESSO = {
  slug: "e2e-org-acesso",
  email: "owner-acesso@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// O corretor que "esquece a senha". Identidade e vínculo ativos.
export const ORG_ACESSO_CORRETOR = {
  slug: "e2e-org-acesso",
  email: "corretor-acesso@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 24 — Organização H: dedicada à captação de identidade ambígua.
export const ORG_CAPTACAO = {
  slug: "e2e-org-captacao",
  email: "owner-captacao@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

export const ORG_CAPTACAO_CORRETOR = {
  slug: "e2e-org-captacao",
  email: "corretor-captacao@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 27 — organizações do ciclo financeiro: uma com trial vigente,
// outra com trial vencido.
export const ORG_TRIAL = {
  slug: "e2e-org-trial",
  email: "owner-trial@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};
export const ORG_VENCIDA = {
  slug: "e2e-org-vencida",
  email: "owner-vencida@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 26 — identidade multi-org: OWNER na Organização J e BROKER na K,
// que têm fusos e políticas de visibilidade diferentes. É a matriz que
// prova que trocar de organização troca papel, calendário e escopo.
export const MULTI_ORG = {
  email: "multi-org@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

export const ORG_MULTI_A = { slug: "e2e-org-multi-a", nome: "Organização E2E Multi A" };
export const ORG_MULTI_B = { slug: "e2e-org-multi-b", nome: "Organização E2E Multi B" };

// Identidade que já tem conta em OUTRA organização (a de captação) — é
// quem prova que convidar alguém existente cria vínculo novo sem criar
// segunda identidade. Dedicada de propósito: aceitar o convite lhe dá um
// segundo vínculo ativo, e fazer isso com um dono compartilhado
// contaminaria todas as specs que logam com ele.
export const USUARIO_JA_TEM_CONTA = {
  email: "ja-tem-conta@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Os dois dados que colidem no seed: o e-mail pertence a uma pessoa, o
// telefone a outra. Enviá-los juntos é o que produz o conflito.
export const COLISAO_CAPTACAO = {
  email: "colisao@e2e.test",
  telefone: "11944440001",
};

export const ORG_RESTRITA = {
  slug: "e2e-org-restrita",
  email: "owner-restrita@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};
export const ORG_RESTRITA_ANA = {
  slug: "e2e-org-restrita",
  email: "ana-restrita@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};
export const ORG_RESTRITA_BRUNO = {
  slug: "e2e-org-restrita",
  email: "bruno-restrita@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 29 — organização dedicada ao portfólio público do corretor. Ver o
// racional em prisma/seed-e2e.ts, seção "Organização P": a faceta afirma
// números absolutos de imóveis por corretor, e Org A é mutada por vários
// specs.
export const ORG_PORTFOLIO = {
  slug: "e2e-org-portfolio",
  email: "owner-portfolio@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 30 — organização dedicada à caixa de entrada comercial.
export const ORG_INBOX = {
  slug: "e2e-org-inbox",
  email: "owner-inbox@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 35 — organização dedicada à COMISSÃO A RECEBER. Organização
// própria pelo mesmo motivo das anteriores: as asserções afirmam valores
// ABSOLUTOS de dinheiro, e registrar um pagamento em qualquer org
// compartilhada deslocaria os números de liquidacao/participacao/analytics.
//
// Duas identidades com papéis diferentes, de propósito:
//   OWNER    conduz a jornada — só ele pode registrar e cancelar pagamento.
//   BRUNO    guarda a carteira de LEITURA, nunca mutada, e prova que um
//            BROKER vê exclusivamente a própria participação.
export const ORG_COMISSOES = {
  slug: "e2e-org-comissoes",
  email: "owner-comissoes@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};
// Fase 36 — POSSE DO LEAD. Duas organizações dedicadas porque a fase
// prova comportamentos OPOSTOS das duas políticas de visibilidade, e
// porque a jornada muda dono e registra atendimento — mutações que
// deslocariam as asserções de escopo-comercial.spec.ts na Org G.
//
//   S (e2e-org-posse)        RESTRICTED — a dona distribui, Ana recebe,
//                            Bruno não enxerga o que não é dele.
//   T (e2e-org-posse-colab)  COLLABORATIVE — ter dono NÃO tira a pessoa
//                            da vista do colega.
export const ORG_POSSE = {
  slug: "e2e-org-posse",
  email: "owner-posse@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};
export const ORG_POSSE_ANA = {
  slug: "e2e-org-posse",
  email: "ana-posse@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};
export const ORG_POSSE_BRUNO = {
  slug: "e2e-org-posse",
  email: "bruno-posse@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};
export const ORG_POSSE_COLAB_ANA = {
  slug: "e2e-org-posse-colab",
  email: "ana-posse-colab@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};
export const ORG_POSSE_COLAB_BRUNO = {
  slug: "e2e-org-posse-colab",
  email: "bruno-posse-colab@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 37 — organização dedicada ao RESULTADO DA VISITA. A jornada
// encerra visitas de verdade, e fazer isso numa org compartilhada
// deslocaria os KPIs da Agenda e os contadores do Analytics.
export const ORG_RESULTADO = {
  slug: "e2e-org-resultado",
  email: "owner-resultado@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 38 — organização dedicada ao EMPREENDIMENTO. Própria porque a
// fase afirma QUAIS unidades aparecem numa ficha pública, e qualquer
// imóvel a mais numa org compartilhada mudaria essas asserções.
export const ORG_EMPREENDIMENTO = {
  slug: "e2e-org-empreendimento",
  email: "owner-empreendimento@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

// Fase 39 — organização dedicada à BARRA DE RECURSOS. Própria porque a
// fase afirma QUAIS botões aparecem por imóvel, e o seed não cria mídia
// em nenhuma outra organização.
export const ORG_RECURSOS = {
  slug: "e2e-org-recursos",
  email: "owner-recursos@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

export const ORG_COMISSOES_BRUNO = {
  slug: "e2e-org-comissoes",
  email: "bruno-comissoes@e2e.test",
  senha: process.env.SEED_ADMIN_SENHA ?? "senha-e2e-teste-123",
};

export const IDS_E2E = {
  // Fase 30 — organização dedicada à CAIXA DE ENTRADA comercial
  // (Organização Q). Números absolutos de novos contatos, então
  // organização própria pelo mesmo motivo estrutural das C/D/N/P.
  // Fase 33 — negociação dedicada à NEGOCIAÇÃO DE VALORES. Pessoa
  // própria, sem contato de site: assim ela nunca entra na caixa de
  // entrada e os números daquele bloco continuam valendo.
  membroInboxOwner: "e2e-membro-inbox-owner",
  pessoaNegociacao: "e2e-pessoa-negociacao",
  // Fase 34 — fechamento coerente: imóveis e negociações dedicadas,
  // separadas das da Fase 33, porque GANHAR muda o status do imóvel e
  // isso não pode contaminar as asserções de preço/catálogo dos outros
  // specs.
  imovelFechamentoGanho: "e2e-imovel-fechamento-ganho",
  imovelFechamentoPerda: "e2e-imovel-fechamento-perda",
  pessoaFechamentoGanho: "e2e-pessoa-fechamento-ganho",
  pessoaFechamentoPerda: "e2e-pessoa-fechamento-perda",
  interesseFechamentoGanho: "e2e-interesse-fechamento-ganho",
  interesseFechamentoPerda: "e2e-interesse-fechamento-perda",
  // Negociação que NUNCA é fechada: os testes de teclado e responsivo
  // só abrem o diálogo, e depender das outras duas os deixaria reféns da
  // ordem de execução (quem fecha primeiro apaga o botão dos seguintes).
  imovelFechamentoDialogo: "e2e-imovel-fechamento-dialogo",
  pessoaFechamentoDialogo: "e2e-pessoa-fechamento-dialogo",
  interesseFechamentoDialogo: "e2e-interesse-fechamento-dialogo",
  // Padrão visual da ficha do imóvel — cliente com preferência
  // cadastrada, para "Clientes compatíveis" renderizar uma RECOMENDAÇÃO
  // de verdade e não o estado vazio.
  pessoaCompativelInbox: "e2e-pessoa-compativel-inbox",
  // Fase 35 — carteira de comissão (Organização R).
  imovelComissaoParcial: "e2e-imovel-comissao-parcial",
  imovelComissaoPendente: "e2e-imovel-comissao-pendente",
  imovelComissaoPerdido: "e2e-imovel-comissao-perdido",
  imovelComissaoSemValor: "e2e-imovel-comissao-sem-valor",
  imovelComissaoJornada: "e2e-imovel-comissao-jornada",
  // Fase 36 — posse do lead (Organizações S e T).
  imovelPosse: "e2e-imovel-posse",
  imovelPosseColab: "e2e-imovel-posse-colab",
  // Fase 37 — resultado da visita (Organização U).
  imovelResultado: "e2e-imovel-resultado",
  // Fase 38 — empreendimento (Organização V). Ids fixos: os specs abrem
  // a ficha da unidade atual e conferem quais outras aparecem.
  imovelAlpha1: "e2e-imovel-alpha-1",
  imovelAlpha2: "e2e-imovel-alpha-2",
  imovelAlpha3: "e2e-imovel-alpha-3",
  imovelAlpha4: "e2e-imovel-alpha-4",
  imovelAlpha5: "e2e-imovel-alpha-5",
  imovelAlphaVendida: "e2e-imovel-alpha-vendida",
  imovelBeta1: "e2e-imovel-beta-1",
  imovelAvulso: "e2e-imovel-avulso",
  imovelSoloAlpha: "e2e-imovel-solo-alpha",
  // Fase 39 — barra de recursos (Organização W). Um imóvel por
  // combinação, para cada asserção ter um caso real.
  imovelSemRecursos: "e2e-imovel-sem-recursos",
  imovelSoPlanta: "e2e-imovel-so-planta",
  imovelSoVideo: "e2e-imovel-so-video",
  imovelSoTour: "e2e-imovel-so-tour",
  imovelTresRecursos: "e2e-imovel-tres-recursos",
  imovelTourInseguro: "e2e-imovel-tour-inseguro",
  // Fase 40 — frase de destaque. Dois imóveis na MESMA organização, para
  // provar presença e ausência sem depender de outro tenant.
  imovelComFrase: "e2e-imovel-com-frase",
  imovelSemFrase: "e2e-imovel-sem-frase",
  // Fase 42 — o que tem por perto (Organização W). Um imóvel com locais
  // fixos para a ficha pública e um vazio que a spec de admin edita.
  imovelComLocais: "e2e-imovel-com-locais",
  imovelLocaisAdmin: "e2e-imovel-locais-admin",
  // Fase 43 — primeira tela comercial (Organização W, sem WhatsApp). Um
  // imóvel por regra de preço; o de venda E locação também tem DOIS
  // vídeos, o pior caso de altura para a primeira dobra.
  imovelDobraVenda: "e2e-imovel-dobra-venda",
  imovelDobraAluguel: "e2e-imovel-dobra-aluguel",
  imovelDobraAmbos: "e2e-imovel-dobra-ambos",
  imovelDobraSemPreco: "e2e-imovel-dobra-sem-preco",
  // Fase 44 — galeria comercial: um imóvel por quantidade de fotos.
  imovelGaleria0: "e2e-imovel-galeria-0",
  imovelGaleria1: "e2e-imovel-galeria-1",
  imovelGaleria2: "e2e-imovel-galeria-2",
  imovelGaleria3: "e2e-imovel-galeria-3",
  imovelGaleria4: "e2e-imovel-galeria-4",
  imovelGaleria5: "e2e-imovel-galeria-5",
  imovelGaleria7: "e2e-imovel-galeria-7",
  // Fase 45 — conteúdo editorial da galeria (título, subtítulo, selo de
  // entrega e legendas), um imóvel por combinação.
  imovelEditorialTitulo: "e2e-imovel-editorial-titulo",
  imovelEditorialSubtitulo: "e2e-imovel-editorial-subtitulo",
  imovelEditorialAmbos: "e2e-imovel-editorial-ambos",
  imovelEditorialEntrega: "e2e-imovel-editorial-entrega",
  imovelEditorialDataSemLancamento: "e2e-imovel-editorial-data-pronto",
  imovelEditorialLancamentoSemData: "e2e-imovel-editorial-lancamento-sem-data",
  imovelEditorialCompleto: "e2e-imovel-editorial-completo",
  imovelEditorialAdmin: "e2e-imovel-editorial-admin",
  interesseNegociacao: "e2e-interesse-negociacao",
  imovelInbox: "e2e-imovel-inbox",
  // Fase 29 — organização dedicada ao PORTFÓLIO PÚBLICO do corretor
  // (Organização P). Ids de membro fixos porque a faceta ?corretor= é
  // filtrada por OrganizationMember.id: sem id determinístico, o spec
  // teria de descobrir o membro pela UI antes de cada asserção.
  membroPortfolioPaula: "e2e-membro-portfolio-paula",
  membroPortfolioRui: "e2e-membro-portfolio-rui",
  membroPortfolioSonia: "e2e-membro-portfolio-sonia",
  imovelPortfolioSonia: "e2e-imovel-portfolio-sonia",
  imovelParaEditarOrgA: "e2e-imovel-editar-a",
  membroOwnerOrgB: "e2e-membro-owner-b",
  imovelOrgB: "e2e-imovel-org-b",
  imovelOrgAgenda: "e2e-imovel-org-agenda",
  // Redesenho de Imóveis — fixo e nunca mutado por outro spec (diferente
  // de imovelParaEditarOrgA, que "editar imóvel" reescreve): garante
  // badges (Lançamento/Destaque/Oportunidade/Slideshow) e os KPIs
  // Oportunidades/Destaques sempre com pelo menos 1 registro real,
  // deterministicamente, em qualquer ordem de execução dos specs.
  imovelComBadgesOrgA: "e2e-imovel-badges-a",
  // Fase 2 (detalhe do imóvel) — o contraponto do imóvel acima: RENT com
  // rentPrice e sem condomínio, IPTU, obra nem foto, usado pra provar que
  // cada bloco opcional da página some quando o dado não existe.
  imovelAluguelOrgA: "e2e-imovel-aluguel-a",
  // Fase 3 — lançamento MÍNIMO: tem o rótulo "Lançamento" e nada mais
  // (sem estágio de obra, previsão, construtora, planta ou
  // característica). Contraponto do imovelComBadgesOrgA, que tem a ficha
  // completa: juntos provam que cada bloco da experiência de lançamento
  // aparece por dado real e some sozinho quando o dado não existe.
  imovelLancamentoMinimoOrgA: "e2e-imovel-comercial-a",
  // Fase 5 — imóveis da Organização de Analytics (ver prisma/seed-e2e.ts,
  // seção "Organização D"): campeão do ranking, segundo colocado e um que
  // nunca recebe contato nenhum.
  imovelTopOrgAnalytics: "e2e-imovel-analytics-top",
  imovelSecundarioOrgAnalytics: "e2e-imovel-analytics-2",
  imovelSemContatoOrgAnalytics: "e2e-imovel-analytics-sem-contato",
  // Organização N — tracking/atribuição dirigidos por navegador. Separada
  // da de Analytics porque o evento sai por navigator.sendBeacon, que a
  // interceptação de rota do Playwright não captura de forma confiável:
  // um vazamento tem de cair onde nenhum número absoluto é afirmado.
  imovelTopOrgTracking: "e2e-imovel-tracking-top",
  imovelSecundarioOrgTracking: "e2e-imovel-tracking-2",
};

// Fase P.10 — mesmo valor de prisma/seed-e2e.ts (duplicado de propósito,
// não importado de lá: importar prisma/seed-e2e.ts puxaria o Prisma
// Client inteiro pro processo do Playwright, que não roda sob o mesmo
// runtime ESM do Next — mesmo motivo de IDS_E2E acima já ser duplicado
// em vez de importado).
export const HOSTNAME_E2E_ORG_B = "b.e2e-dominio-teste.test";

// Fase 22 — troca de usuário DENTRO do mesmo teste. `login` sozinho não
// serve: com sessão ativa, /app/login redireciona para /app e o campo de
// e-mail nunca aparece. Limpar os cookies do contexto é o que torna a
// troca possível — e vários cenários de visibilidade precisam comparar
// dois corretores na mesma execução.
export async function entrarComo(page: Page, credenciais: { email: string; senha: string }) {
  // Limpar os cookies e ir direto para o formulário tem uma janela de
  // corrida: uma requisição em voo da página anterior pode reescrever o
  // cookie de sessão, e /app/login então REDIRECIONA para /app — o campo
  // #email nunca aparece e o fill estoura por timeout.
  //
  // Garante o estado deslogado ANTES de preencher, e preenche NA PÁGINA
  // JÁ VERIFICADA: uma primeira versão deste helper navegava, conferia, e
  // então chamava login(), que navegava de novo — a segunda navegação
  // reintroduzia exatamente a corrida que a conferência tinha eliminado.
  // Nada aqui é timeout maior nem retry de teste.
  //
  // Fase 26 — a causa RAIZ da corrida, que a repetição só disfarçava:
  // limpar cookies com uma página do app carregada não impede que uma
  // resposta ainda em voo daquela página reescreva o cookie de sessão
  // logo depois. Sair para about:blank primeiro aborta qualquer
  // requisição pendente e não gera nenhuma nova — a partir daí não
  // existe mais nada capaz de reautenticar o contexto.
  //
  // O flake era real e observado: ele saltava de teste em teste entre
  // execuções da mesma spec, sempre com #email nunca aparecendo porque
  // /app/login redirecionava para /app.
  await page.goto("about:blank");
  await page.context().clearCookies();
  await page.goto("/app/login");
  await preencherLogin(page, credenciais);
}

export async function login(page: Page, credenciais: { email: string; senha: string }) {
  await page.goto("/app/login");
  await preencherLogin(page, credenciais);
}

async function preencherLogin(page: Page, credenciais: { email: string; senha: string }) {
  await page.locator("#email").fill(credenciais.email);
  await page.locator("#senha").fill(credenciais.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/app");
}

// CamposAntiSpam bloqueia qualquer envio de formulário público que chegue
// em menos de 1.5s após o formulário renderizar (src/app/(public)/actions.ts,
// LIMIAR_MUITO_RAPIDO_MS) — Playwright preenche campos rápido demais pra
// esse limiar por padrão, então specs de formulário público esperam aqui
// antes de enviar.
export async function esperarJanelaAntiSpam(page: Page) {
  await page.waitForTimeout(1600);
}

// =======================================================================
// Fase 25 — obter o token de acesso no E2E
// =======================================================================
// O token bruto só existe no e-mail, e não há e-mail em teste. Este
// helper roda scripts/e2e-token.ts, que reescreve o hash da linha criada
// pelo fluxo REAL para o hash de um token conhecido, e o devolve. Ver o
// cabeçalho daquele arquivo: o que se testa depois é o consumo de
// verdade — validação, expiração, uso único e replay.
// =======================================================================
// Restauração do fixture de perfil público
// =======================================================================
// Publicar um perfil é estado GLOBAL do tenant, então todo teste que
// publica precisa despublicar depois. O caminho normal é pelo painel (é
// o fluxo real do produto). O problema observado: num timeout de teste o
// `finally` roda, mas a página já está fechada, a restauração pela UI
// falha e o próximo teste herda um perfil publicado.
//
// Esta função é a rede: tenta o caminho da UI e, se ele falhar por
// qualquer motivo, escreve direto no banco de teste — que funciona mesmo
// sem navegador vivo. Um teste interrompido deixa de contaminar os
// seguintes, sem aumentar timeout e sem enfraquecer asserção nenhuma.
export async function restaurarPerfilDespublicado(
  restaurarPelaUI: () => Promise<void>
): Promise<void> {
  try {
    await restaurarPelaUI();
  } catch {
    despublicarPerfisNoBanco();
  }
}

// Faxina direta no banco de teste — sem browser, sem sessão.
export function despublicarPerfisNoBanco(orgSlug?: string): void {
  perfilPublicoNoBanco("despublicar", ...(orgSlug ? [orgSlug] : []));
}

// Fase 29 — o outro lado, para fixture: publica membros por id, sem
// navegador. Quem prova que o PAINEL publica é perfil-corretor.spec.ts,
// pela interface; aqui a publicação é só o estado de partida de quem
// testa a faceta "imóveis deste corretor".
export function publicarPerfisNoBanco(...membroIds: string[]): void {
  perfilPublicoNoBanco("publicar", ...membroIds);
}

// Publica o membro de uma organização identificado pelo E-MAIL e devolve
// o id dele. Existe para a Organização A, cujo membro não tem id fixo no
// seed — e a faceta "?corretor=" é filtrada por id.
export function publicarPerfilPorEmailNoBanco(orgSlug: string, email: string): string {
  return perfilPublicoNoBanco("publicar-email", orgSlug, email).trim();
}

function perfilPublicoNoBanco(
  acao: "publicar" | "despublicar" | "publicar-email",
  ...argumentos: string[]
): string {
  const raiz = path.resolve(__dirname, "..", "..");
  return execFileSync(
    "npx",
    ["tsx", path.join(raiz, "scripts", "e2e-perfil-publico.ts"), acao, ...argumentos],
    { cwd: raiz, encoding: "utf8" }
  );
}

// Fase 31 — remove os atendimentos criados por um spec, pelo marcador da
// nota. Cirúrgico de propósito: o atendimento que vem do seed precisa
// sobreviver (ver scripts/e2e-atendimento.ts).
export function limparAtendimentosNoBanco(marcador: string): void {
  const raiz = path.resolve(__dirname, "..", "..");
  execFileSync("npx", ["tsx", path.join(raiz, "scripts", "e2e-atendimento.ts"), "limpar", marcador], {
    cwd: raiz,
    encoding: "utf8",
  });
}

export function obterTokenDeAcesso(
  tipo: "convite" | "reset" | "cadastro",
  email: string,
  modo?: "expirado"
): string {
  const raiz = path.resolve(__dirname, "..", "..");
  const saida = execFileSync(
    "npx",
    ["tsx", path.join(raiz, "scripts", "e2e-token.ts"), tipo, email, ...(modo ? [modo] : [])],
    { cwd: raiz, encoding: "utf8" }
  ).trim();
  // Só a ÚLTIMA linha: qualquer ferramenta da cadeia (npx, dotenv) pode
  // escrever no stdout antes do token, e concatenar isso ao segredo
  // produziria uma URL silenciosamente inválida — que foi exatamente o
  // que aconteceu na primeira execução deste spec.
  return saida.split("\n").pop()!.trim();
}
