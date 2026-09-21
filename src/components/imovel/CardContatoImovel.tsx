import { FormularioContato } from "@/components/FormularioContato";
import { Card, CardContent } from "@/components/ui/card";
import { ValoresDoImovel, type ValoresImovel } from "@/components/imovel/ValoresDoImovel";
import { TITULO_BLOCO } from "@/lib/site-typography";

// Card lateral de conversão do detalhe do imóvel. A hierarquia é
// deliberada — valor, quem atende, formulário — porque é esse o caminho
// que o visitante percorre.
//
// Extraído do detalhe porque a página de lançamento precisa do mesmo
// card, com os mesmos dois modos (com e sem WhatsApp configurado).
//
// Fase 51 — a hierarquia passou a ser preço/CTAs → corretor responsável
// → "Receba mais informações" (o formulário) → política de privacidade.
// O corretor está aqui de novo (saíra para a coluna de conteúdo na Fase
// 43): quem atende vem logo antes de quem pergunta. A coluna de conteúdo
// não o repete.
//
// Fase 55 — entre o valor e o corretor entra "Agendar uma visita": a
// única ação do card que cria compromisso, e por isso a que vem antes de
// quem atende.
//
// Fase 54 — o CTA grande "Falar no WhatsApp" saiu daqui. Ele era o
// terceiro convite de WhatsApp da mesma tela (barra fixa no celular,
// toolbar do corretor) e separava o preço de quem atende. O que fica
// abaixo do valor é a observação do anunciante sobre ele, quando
// houver. O canal continua existindo: WhatsApp do corretor logo abaixo,
// formulário no fim do card e barra fixa no celular.

export function CardContatoImovel({
  imovel,
  imovelId,
  orgSlug,
  basePath,
  mensagemFormulario,
  idFormulario,
  corretor,
  agendarVisita,
}: {
  imovel: ValoresImovel;
  imovelId: string;
  orgSlug: string;
  mensagemFormulario: string;
  idFormulario: string;
  basePath: string;
  /** O corretor responsável, quando ele publicou o perfil. */
  corretor?: React.ReactNode;
  /** Fase 55 — o agendamento de visita, quando o imóvel aceita visita. */
  agendarVisita?: React.ReactNode;
}) {
  return (
    <Card data-card-contato className="h-fit lg:sticky lg:top-[calc(var(--site-header-height,88px)+1rem)]">
      <CardContent className="space-y-4">
        <ValoresDoImovel imovel={imovel} />

        {agendarVisita}

        {corretor}

        <div id={idFormulario} className="space-y-3 border-t pt-4 scroll-mt-24">
          <h2 className={TITULO_BLOCO}>Receba mais informações</h2>
          <FormularioContato
            imovelId={imovelId}
            mensagemPreenchida={mensagemFormulario}
            idPrefixo="aside-"
            orgSlug={orgSlug}
            basePath={basePath}
          />
        </div>
      </CardContent>
    </Card>
  );
}
