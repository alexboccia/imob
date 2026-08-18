import { test, expect } from "@playwright/test";
import { HOSTNAME_E2E_ORG_B, IDS_E2E } from "./helpers";

// Fase P.10 — tenant resolver por host (src/proxy.ts). Simula o Host real
// que um custom domain apontado via CNAME enviaria (não edita /etc/hosts:
// conecta em localhost mesmo, só troca o header Host — é exatamente o que
// a DigitalOcean App Platform faz na prática, ver comentário em
// src/proxy.ts sobre a decisão de confiar só em request.headers.get("host")).
test.describe("custom domain — tenant resolver por Host", () => {
  test("host de custom domain ATIVO da Organização B serve o site de B, nunca o de A", async ({ request }) => {
    const resposta = await request.get("/", { headers: { Host: HOSTNAME_E2E_ORG_B } });
    expect(resposta.status()).toBe(200);
    const corpo = await resposta.text();
    expect(corpo).toContain("Organização E2E B");
    expect(corpo).not.toContain("Organização E2E A");
  });

  test("host de custom domain resolve também rotas internas (ex: /imoveis) pra organização certa", async ({
    request,
  }) => {
    const resposta = await request.get("/imoveis", { headers: { Host: HOSTNAME_E2E_ORG_B } });
    expect(resposta.status()).toBe(200);
    const corpo = await resposta.text();
    expect(corpo).toContain("Imóvel da Organização B");
  });

  test("host desconhecido/não cadastrado nunca serve conteúdo de nenhuma organização", async ({ request }) => {
    const resposta = await request.get("/", { headers: { Host: "www.host-nunca-cadastrado.test" } });
    expect(resposta.status()).toBe(404);
  });

  test("host canônico (sem custom domain) continua servindo a organização padrão normalmente", async ({
    request,
  }) => {
    const resposta = await request.get("/");
    expect(resposta.status()).toBe(200);
    const corpo = await resposta.text();
    expect(corpo).toContain("Organização E2E A");
  });

  test("/app permanece host-agnóstico — acessível mesmo sob um Host de custom domain", async ({ request }) => {
    const resposta = await request.get("/app/login", { headers: { Host: HOSTNAME_E2E_ORG_B } });
    expect(resposta.status()).toBe(200);
  });
});

// Correção AU (auditoria pré-commit P.10) — canonical/sitemap/robots
// precisam refletir o domínio REAL sob o qual o visitante está, não o
// domínio global da plataforma, quando a organização tem um custom
// domain ACTIVE (ver src/lib/platform/organization-domain.ts:
// buscarHostnameCustomAtivo/resolverOrigemPublicacao).
test.describe("custom domain — SEO (canonical, sitemap, robots)", () => {
  test("canonical da home sob custom domain é absoluto pro próprio domínio, sem o slug", async ({ request }) => {
    const resposta = await request.get("/", { headers: { Host: HOSTNAME_E2E_ORG_B } });
    const corpo = await resposta.text();
    // Next normaliza a barra redundante do caminho-raiz ("/" vira "") ao
    // resolver o metadata field — confirmado ao vivo, não assumido: o
    // resultado é href="https://host" (sem trailing slash), mesmo
    // comportamento do canonical global de sempre (ver teste abaixo).
    expect(corpo).toContain(`<link rel="canonical" href="https://${HOSTNAME_E2E_ORG_B}"`);
    expect(corpo).not.toContain(`${HOSTNAME_E2E_ORG_B}/e2e-org-b`);
    expect(corpo).not.toContain(`${HOSTNAME_E2E_ORG_B}//`);
  });

  test("canonical de imóvel sob custom domain é absoluto pro próprio domínio, preservando o path", async ({
    request,
  }) => {
    const resposta = await request.get(`/imoveis/${IDS_E2E.imovelOrgB}`, { headers: { Host: HOSTNAME_E2E_ORG_B } });
    const corpo = await resposta.text();
    expect(corpo).toContain(
      `<link rel="canonical" href="https://${HOSTNAME_E2E_ORG_B}/imoveis/${IDS_E2E.imovelOrgB}"`
    );
  });

  test("canonical sob o host canônico (sem custom domain) continua relativo/resolvido pra metadataBase, como antes", async ({
    request,
  }) => {
    const resposta = await request.get("/");
    const corpo = await resposta.text();
    // Organização A é a PUBLIC_ORG_SLUG (sem prefixo) — canonical relativo
    // "/" resolvido contra metadataBase, nunca um host absoluto de custom
    // domain (comportamento ORIGINAL, intocado por esta correção).
    expect(corpo).toMatch(/<link rel="canonical" href="[^"]+"/);
    expect(corpo).not.toContain(HOSTNAME_E2E_ORG_B);
  });

  test("sitemap.xml sob custom domain só lista a própria organização, sob o próprio domínio", async ({
    request,
  }) => {
    const resposta = await request.get("/sitemap.xml", { headers: { Host: HOSTNAME_E2E_ORG_B } });
    expect(resposta.status()).toBe(200);
    const corpo = await resposta.text();
    expect(corpo).toContain(`https://${HOSTNAME_E2E_ORG_B}/`);
    expect(corpo).toContain(`https://${HOSTNAME_E2E_ORG_B}/imoveis/${IDS_E2E.imovelOrgB}`);
    expect(corpo).not.toContain("Organização E2E A");
    expect(corpo).not.toContain("e2e-org-a");
    expect(corpo).not.toContain(IDS_E2E.imovelParaEditarOrgA);
  });

  test("sitemap.xml global exclui a organização que já tem custom domain ACTIVE (sem duplicata)", async ({
    request,
  }) => {
    const resposta = await request.get("/sitemap.xml");
    expect(resposta.status()).toBe(200);
    const corpo = await resposta.text();
    expect(corpo).toContain(IDS_E2E.imovelParaEditarOrgA);
    expect(corpo).not.toContain(HOSTNAME_E2E_ORG_B);
    expect(corpo).not.toContain(IDS_E2E.imovelOrgB);
  });

  test("sitemap.xml sob host desconhecido não expõe dado de nenhuma organização", async ({ request }) => {
    const resposta = await request.get("/sitemap.xml", { headers: { Host: "www.host-nunca-cadastrado.test" } });
    expect(resposta.status()).toBe(200);
    const corpo = await resposta.text();
    expect(corpo).not.toContain(HOSTNAME_E2E_ORG_B);
    expect(corpo).not.toContain(IDS_E2E.imovelParaEditarOrgA);
    expect(corpo).not.toContain(IDS_E2E.imovelOrgB);
  });

  test("robots.txt aponta pro sitemap do próprio host sob custom domain, e pro global no host canônico", async ({
    request,
  }) => {
    const respostaCustom = await request.get("/robots.txt", { headers: { Host: HOSTNAME_E2E_ORG_B } });
    expect((await respostaCustom.text())).toContain(`https://${HOSTNAME_E2E_ORG_B}/sitemap.xml`);

    const respostaGlobal = await request.get("/robots.txt");
    const corpoGlobal = await respostaGlobal.text();
    expect(corpoGlobal).not.toContain(HOSTNAME_E2E_ORG_B);
    expect(corpoGlobal).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  });
});
