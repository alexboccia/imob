// Rota pública da Política de Privacidade (Fase 51). Um lugar só: o
// formulário, o rodapé e a própria página montam o caminho por aqui, com
// o prefixo da organização quando ela não é a do domínio principal.
export const SEGMENTO_POLITICA_PRIVACIDADE = "politica-de-privacidade";

export function caminhoPoliticaPrivacidade(basePath: string): string {
  return `${basePath}/${SEGMENTO_POLITICA_PRIVACIDADE}`;
}
