import { handlers } from "@/lib/platform/auth";

// Diferente de /api/auth/[...nextauth]/route.ts (login de /app), esta
// rota não precisa de um wrapper especial de rate limit: o login de
// /platform acontece via Server Action (signIn() chamado em processo, sem
// requisição HTTP real — ver src/app/platform/login/actions.ts), então a
// checagem de bloqueio já está dentro do authorize() de
// @/lib/platform/auth.ts. Esta rota existe só pelo resto do contrato
// padrão do Auth.js (ex: leitura de sessão/csrf), não pelo fluxo de login
// em si.
export const { GET, POST } = handlers;
