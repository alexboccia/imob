import {
  IconeArea,
  IconeBanheiro,
  IconeQuartos,
  IconeSuite,
  IconeVaga,
} from "@/components/icons";
import { IconeCaracteristica } from "@/lib/caracteristicas-icones";
import {
  montarItensCondominio,
  montarItensUnidade,
  type DadosFichaUnidade,
  type ItemFicha,
} from "@/lib/caracteristicas-ficha";
import { TITULO_BLOCO } from "@/lib/site-typography";

// As duas seções de características da ficha pública: o que é da
// UNIDADE e o que é do CONDOMÍNIO. A separação não é decisão de
// apresentação — é o dado: Property guarda dois arrays distintos
// (propertyFeatures / condoFeatures), espelho de FeatureOption.category
// (PROPERTY | CONDO), que é o que o painel administra em
// /app/caracteristicas. Nenhuma linha deste arquivo olha o NOME de uma
// característica pra decidir onde ela entra.
//
// Apresentação: grade leve de ÍCONE + TEXTO, sem card, sem borda e sem
// divisor por item. O texto carrega a informação inteira; o ícone é
// apoio visual e some pra quem usa leitor de tela (aria-hidden no
// wrapper). Quem monta os itens, com pluralização e ordem, é
// caracteristicas-ficha.ts.

const ICONES: Record<
  Exclude<ItemFicha["icone"], "catalogo">,
  (props: { className?: string }) => React.ReactNode
> = {
  area: IconeArea,
  quartos: IconeQuartos,
  suite: IconeSuite,
  banheiro: IconeBanheiro,
  vaga: IconeVaga,
};

// Colunas medidas no container REAL, não no viewport: a ficha é
// max-w-6xl (1152px) e, a partir de lg, esta coluna ocupa 2/3 de um grid
// de 3 — ~704px em 1280/1440 e ~618px em 1024. Daí 4 colunas só em xl,
// 2 de sm até lg (inclui o tablet em 768, onde a página ainda é de
// coluna única) e 1 no mobile.
//
// Grade regular, sem justify-between: a distribuição vem de colunas
// iguais do próprio grid, não de sobra empurrada pras bordas.
//
// gap-x-6 (e não 8) por medição: em xl a coluna de conteúdo tem 736px,
// então cada uma das 4 colunas fica com 166px a 24px de gap e 160px a
// 32px. Sobram, pro texto, 130px contra 124px — a diferença entre
// "1 vaga de garagem" (128px) caber numa linha ou não. Ganhar respiro
// horizontal aqui custava legibilidade, então o respiro extra foi todo
// pro eixo vertical (gap-y-4).
const GRADE = "grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4";

function Grade({ itens }: { itens: ItemFicha[] }) {
  return (
    <ul className={GRADE}>
      {itens.map((item) => {
        const Icone = item.icone === "catalogo" ? null : ICONES[item.icone];
        return (
          <li
            key={item.chave}
            className="flex items-start gap-3 text-[0.9375rem] leading-6 text-gray-700"
          >
            {/* items-start, e não items-center: nome longo ("Lavanderia
                compartilhada") quebra em duas linhas nas colunas
                estreitas do desktop, e centralizar jogaria o ícone pro
                meio do bloco de texto — alinhado à PRIMEIRA linha ele
                fica certo nos dois casos.
                
                A caixa do ícone tem largura E altura fixas de 24px
                (h-6 w-6), independentes do glifo: é ela que reserva a
                coluna do ícone, então o texto de todos os itens começa
                exatamente no mesmo x, e é ela que casa com a linha do
                texto (leading-6 = 24px), deixando ícone e primeira linha
                centrados entre si sem nenhum ajuste de margem. */}
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center text-primary"
            >
              {Icone ? (
                <Icone className="size-5.5" />
              ) : (
                // Sem regra de ícone pro nome, IconeCaracteristica cai no
                // check genérico do próprio design system: a informação
                // nunca some por falta de ícone.
                <IconeCaracteristica nome={item.texto} className="size-5.5" />
              )}
            </span>
            {/* Sem line-clamp e sem truncate: característica nenhuma é
                cortada — quebra em duas linhas quando precisa. */}
            <span className="min-w-0">{item.texto}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Secao({
  id,
  titulo,
  itens,
}: {
  id: string;
  titulo: string;
  itens: ItemFicha[];
}) {
  // Sem item não há o que listar: a seção inteira some, em vez de
  // deixar um título com espaço vazio embaixo. Vale pros dois blocos —
  // condomínio só existe pra parte dos imóveis (casa, terreno, sala com
  // entrada própria).
  if (itens.length === 0) return null;

  return (
    <section data-caracteristicas={id}>
      <h2 className={`${TITULO_BLOCO} mb-5`}>{titulo}</h2>
      <Grade itens={itens} />
    </section>
  );
}

export type CaracteristicasProps = DadosFichaUnidade & { condoFeatures: string[] };

// As duas seções vêm juntas, com um respiro MAIOR entre elas do que o
// que a coluna da ficha dá entre blocos vizinhos (space-y-12 aqui contra
// space-y-10 lá): a transição unidade -> condomínio é justamente a que
// precisa de mais clareza, porque as duas grades têm a mesma aparência.
//
// O agrupamento também evita um espaçador fantasma: num imóvel sem
// característica nenhuma o wrapper inteiro deixa de existir, em vez de
// somar um vão extra entre a descrição e a localização.
export function CaracteristicasDoImovel({ imovel }: { imovel: CaracteristicasProps }) {
  const unidade = montarItensUnidade(imovel);
  const condominio = montarItensCondominio(imovel.condoFeatures);
  if (unidade.length === 0 && condominio.length === 0) return null;

  return (
    <div className="space-y-12">
      <Secao id="unidade" titulo="Características da unidade" itens={unidade} />
      <Secao id="condominio" titulo="Características do condomínio" itens={condominio} />
    </div>
  );
}
