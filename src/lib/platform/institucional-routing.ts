// Site institucional do SaaS (Etapa D do briefing comercial Syntaks) —
// vive em `src/app/institucional/` e só é servido sob o hostname
// institucional (ver hostnameInstitucional em ./hostname). Função pura
// (sem I/O) pra ficar testável sem subir o middleware inteiro: dado um
// pathname já recebido sob o host institucional, decide pra onde
// reescrever, ou que a rota não existe.
//
// Lista fechada de propósito — qualquer caminho fora dela devolve 404 em
// vez de silenciosamente herdar comportamento de organização (ver
// risco #1 do diagnóstico da Etapa A: colisão de roteamento raiz).
const CAMINHOS_INSTITUCIONAIS = new Set<string>(["/", "/planos"]);

export type DecisaoRotaInstitucional = { tipo: "rewrite"; destino: string } | { tipo: "nao_encontrado" };

export function decidirRotaInstitucional(pathname: string): DecisaoRotaInstitucional {
  if (!CAMINHOS_INSTITUCIONAIS.has(pathname)) {
    return { tipo: "nao_encontrado" };
  }
  const sufixo = pathname === "/" ? "" : pathname;
  return { tipo: "rewrite", destino: `/institucional${sufixo}` };
}
