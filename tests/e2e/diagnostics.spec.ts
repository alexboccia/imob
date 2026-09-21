import { test, expect } from "@playwright/test";

// =======================================================================
// Diagnóstico administrativo (Fase 57)
// =======================================================================
// Aqui a rota roda dentro do runtime real do Next, contra o banco real do
// ambiente de teste — é o que os testes com mock não conseguem provar.
//
// O ambiente de teste NÃO é "production" (NEXT_PUBLIC_SENTRY_ENVIRONMENT),
// então a rota responde sem exigir papel: esse é o comportamento que já
// existia antes desta fase e que ela preservou. A checagem de papel em
// produção é exercitada nos testes de integração da rota, onde o ambiente
// pode ser simulado.
//
// O ambiente de teste também deixa UPSTASH_* vazio DE PROPÓSITO (ver
// .env.test), então este é o caminho "não configurado" ponta a ponta —
// justamente o estado que a Fase 57 veio tornar visível.

const ROTA = "/api/admin/diagnostics";

test("o relatório lista as quatro dependências, com Upstash entre elas", async ({ request }) => {
  const resposta = await request.get(ROTA);
  expect(resposta.status()).toBe(200);

  const corpo = await resposta.json();
  expect(Object.keys(corpo.dependencias).sort()).toEqual([
    "postgresql",
    "r2",
    "resend",
    "upstash",
  ]);
});

test("sem UPSTASH_* configurado, o diagnóstico diz 'não configurado' — e não 'erro'", async ({
  request,
}) => {
  const corpo = await (await request.get(ROTA)).json();

  // O estado que antes desta fase só aparecia no log de runtime.
  expect(corpo.dependencias.upstash.ok).toBe(false);
  expect(corpo.dependencias.upstash.motivo).toBe("não configurado");
  // Ambiente sem provider não pode parecer provider quebrado: são dois
  // problemas com correções diferentes.
  expect(corpo.dependencias.upstash.motivo).not.toBe("falha de conexão");
  expect(corpo.dependencias.upstash.motivo).not.toBe("timeout");
});

test("o banco continua sendo a única dependência que decide a saúde geral", async ({ request }) => {
  const corpo = await (await request.get(ROTA)).json();

  expect(corpo.dependencias.postgresql.ok).toBe(true);
  // Upstash ausente NÃO derruba `saudavel`: a Fase 57 é de
  // observabilidade, não mudou a política de disponibilidade.
  expect(corpo.dependencias.upstash.ok).toBe(false);
  expect(corpo.saudavel).toBe(true);
});

test("a resposta não carrega nome de variável, valor, header nem stack trace", async ({
  request,
}) => {
  const bruto = await (await request.get(ROTA)).text();

  // Nem o valor (que não existe aqui), nem o NOME da variável, nem
  // qualquer vocabulário de credencial ou de erro interno.
  expect(bruto).not.toContain("UPSTASH_REDIS_REST_URL");
  expect(bruto).not.toContain("UPSTASH_REDIS_REST_TOKEN");
  expect(bruto).not.toContain("upstash.io");
  expect(bruto).not.toMatch(/Bearer|Authorization|token/i);
  expect(bruto).not.toMatch(/postgresql:\/\/|password/i);
  expect(bruto).not.toMatch(/at Object|node_modules|\.ts:\d+/);
});

test("o diagnóstico responde rápido mesmo com dependência ausente", async ({ request }) => {
  const inicio = Date.now();
  const resposta = await request.get(ROTA);
  expect(resposta.status()).toBe(200);
  // Cada check tem timeout próprio de 3s e todos correm em paralelo —
  // uma dependência lenta nunca soma com as outras.
  expect(Date.now() - inicio).toBeLessThan(15000);
});

test("o health público continua mínimo, sem detalhe de dependência", async ({ request }) => {
  const resposta = await request.get("/api/health");
  expect(resposta.status()).toBe(200);

  const corpo = await resposta.json();
  expect(corpo).toEqual({ status: "ok" });
  // O endpoint público nunca ganhou o detalhamento do protegido.
  expect(corpo).not.toHaveProperty("dependencias");
});
