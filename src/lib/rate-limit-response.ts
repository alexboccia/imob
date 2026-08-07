// Construção compartilhada dos headers de uma resposta 429 — usado pelas
// rotas que conseguem controlar status HTTP de verdade (upload, e o
// wrapper de login descrito em client-ip.ts/route do NextAuth). Server
// Actions (formulário de contato/anuncie) não conseguem definir status
// HTTP customizado nem headers — limitação documentada do Next.js App
// Router (ver node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md,
// seção "Rate limiting": o próprio exemplo oficial usa Route Handler, não
// Server Action) — por isso esses dois formulários seguem retornando
// {sucesso:false, erro} normalmente, sem 429 literal.
export function cabecalhosLimiteExcedido(retryAfterSegundos: number): Record<string, string> {
  return { "Retry-After": String(Math.max(1, Math.round(retryAfterSegundos))) };
}
