import { ORIGENS_CAPTACAO } from "@/lib/captacao";

// =======================================================================
// Elegibilidade de um contato para virar OPORTUNIDADE (Fase 8)
// =======================================================================
// Regra única, usada pelo servidor (criarOportunidadeDoContato) e pela
// tela (para decidir se mostra o botão). A tela nunca é a fronteira de
// segurança — esconder o botão é UX; a action revalida sempre.
//
// Só é elegível o contato de captação sobre um IMÓVEL ESPECÍFICO:
//
//   origin = IMOVEL  E  propertyId != null
//
// Por que os outros ficam de fora, e por que isso NÃO é uma limitação
// acidental:
//
//   CONTATO   conversa geral da página /contato. Pode não ser sobre
//             imóvel nenhum; transformá-la em oportunidade exigiria
//             adivinhar QUAL imóvel, que é exatamente a heurística que
//             esta fase se recusa a fazer. O corretor continua podendo
//             relacionar um imóvel à ficha do cliente pelo fluxo manual
//             de sempre — só que aí, honestamente, sem origem.
//   ANUNCIE   proprietário oferecendo imóvel. É o oposto comercial do
//             funil de comprador: criar uma "oportunidade de compra" a
//             partir dele inventaria uma negociação que nunca existiu.
//   null      interação registrada à mão pelo corretor, ou anterior à
//             Fase 4. Não é captação e nunca teve origem de tráfego para
//             preservar — o vínculo não acrescentaria informação nenhuma.
//
// propertyId é exigido além do origin (e não assumido a partir dele)
// porque um registro antigo ou adulterado poderia ter origin=IMOVEL sem
// imóvel; sem propertyId não existe oportunidade possível.
export function oportunidadeElegivel(interacao: {
  origin: string | null;
  propertyId: string | null;
}): boolean {
  return interacao.origin === ORIGENS_CAPTACAO.IMOVEL && interacao.propertyId !== null;
}
