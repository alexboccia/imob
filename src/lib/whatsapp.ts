// Link de conversa do WhatsApp a partir de um número configurado pelo
// tenant (OrganizationSettings.whatsapp, ou o whatsapp do membro
// responsável pelo imóvel) — nunca de um número fixo do produto.
//
// Existia como string montada à mão em quatro lugares diferentes (home,
// detalhe do imóvel, botão flutuante, telas de CRM), cada um repetindo o
// mesmo replace(/\D/g). Centralizado aqui porque as próximas páginas
// comerciais (imóvel pronto, lançamento, perfil do corretor) precisam do
// MESMO comportamento — inclusive o de não renderizar CTA nenhum quando o
// tenant não configurou número.

// Só os dígitos do número. Devolve "" pra null/undefined/vazio/texto sem
// dígito — quem chama trata como "este tenant não tem WhatsApp" e não
// renderiza o CTA, em vez de gerar um link wa.me quebrado.
export function digitosWhatsApp(numero: string | null | undefined): string {
  if (typeof numero !== "string") return "";
  return numero.replace(/\D/g, "");
}

// true quando dá pra abrir uma conversa de verdade. Um número precisa de
// pelo menos DDD + assinante (10 dígitos no Brasil, 8 no menor formato
// internacional plausível) — abaixo disso é dado incompleto, e mandar o
// visitante pro wa.me com isso abre uma tela de erro do WhatsApp em vez
// de uma conversa.
export function temWhatsApp(numero: string | null | undefined): boolean {
  return digitosWhatsApp(numero).length >= 8;
}

// URL de conversa. Devolve null (em vez de string quebrada) quando não há
// número utilizável — o tipo obriga quem chama a decidir o que fazer sem
// número, que é sempre "não mostrar o CTA".
export function linkWhatsApp(
  numero: string | null | undefined,
  mensagem?: string
): string | null {
  const digitos = digitosWhatsApp(numero);
  if (!temWhatsApp(digitos)) return null;
  const base = `https://wa.me/${digitos}`;
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base;
}
