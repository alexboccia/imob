import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Pirâmide de testes deste projeto (ver README.md, seção "Testes"):
//   - unitários: co-localizados em src/**/*.test.ts, sem banco.
//   - integração: tests/integration/**/*.test.ts, contra o banco de
//     teste separado (ver .env.test) — nunca contra dev/produção.
//   - e2e: tests/e2e/**/*.spec.ts, rodados pelo Playwright (não pelo
//     Vitest — por isso o padrão .spec.ts em vez de .test.ts, pra não
//     colidir com o `include` abaixo).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Testes de integração fazem I/O real (Postgres) — não rodam bem em
    // paralelo por padrão do jeito que os outros são desenhados
    // (independentes), mas isolamos por organização própria por teste
    // (ver src/test/fixtures.ts), então paralelismo continua seguro.
    fileParallelism: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Meta de cobertura só nos módulos com regra de negócio/segurança
      // mais crítica — "não tente atingir cobertura total agora" (ver
      // enunciado da fase). O resto do código não tem meta nesta fase.
      include: [
        "src/lib/authorization.ts",
        "src/lib/entitlements.ts",
        "src/lib/pagination.ts",
        "src/lib/rate-limit.ts",
        "src/lib/upload-validation.ts",
        "src/lib/property-mapper.ts",
        "src/lib/telefone.ts",
        "src/lib/cpf.ts",
        "src/lib/contato-schema.ts",
        "src/lib/client-ip.ts",
        "src/lib/listagens-admin-query.ts",
      ],
      thresholds: {
        statements: 75,
        branches: 65,
        functions: 75,
        lines: 75,
      },
    },
  },
});
