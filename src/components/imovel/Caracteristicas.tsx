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
// Apresentação: grade leve de ÍCONE + TEXTO, sem card por item. O texto
// carrega a informação inteira; o ícone é apoio visual e some pra quem
// usa leitor de tela (aria-hidden no wrapper). Quem monta os itens, com
// pluralização e ordem, é caracteristicas-ficha.ts.

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
// de 3 — ~704px em 1280/1440 e ~618px em 1024. Daí 4 colunas só em xl
// (~158px por coluna, que ainda cabe "Área privativa: 52 m²"), 2 de
// sm até lg (inclui o tablet em 768, onde a página ainda é de coluna
// única) e 1 no mobile.
const GRADE = "grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4";

function Grade({ itens }: { itens: ItemFicha[] }) {
  return (
    <ul className={GRADE}>
      {itens.map((item) => {
        const Icone = item.icone === "catalogo" ? null : ICONES[item.icone];
        return (
          <li key={item.chave} className="flex items-start gap-2.5 text-sm text-gray-700">
            {/* mt-0.5 alinha o ícone à primeira linha do texto — item
                de nome longo quebra em duas linhas nas colunas estreitas
                do desktop, e centralizar deixaria o ícone no meio. */}
            <span aria-hidden className="mt-0.5 shrink-0 text-primary">
              {Icone ? (
                <Icone className="size-5" />
              ) : (
                // Sem regra de ícone pro nome, IconeCaracteristica cai no
                // check genérico do próprio design system: a informação
                // nunca some por falta de ícone.
                <IconeCaracteristica nome={item.texto} className="size-5" />
              )}
            </span>
            <span className="min-w-0">{item.texto}</span>
          </li>
        );
      })}
    </ul>
  );
}

export type CaracteristicasProps = DadosFichaUnidade;

export function CaracteristicasUnidade({ imovel }: { imovel: CaracteristicasProps }) {
  const itens = montarItensUnidade(imovel);
  // Sem nenhum atributo estrutural e sem nenhuma característica não há o
  // que listar: a seção inteira some, em vez de deixar um título com
  // espaço vazio embaixo.
  if (itens.length === 0) return null;

  return (
    <section data-caracteristicas="unidade">
      <h2 className={`${TITULO_BLOCO} mb-4`}>Características da unidade</h2>
      <Grade itens={itens} />
    </section>
  );
}

export function CaracteristicasCondominio({ itens }: { itens: string[] }) {
  const lista = montarItensCondominio(itens);
  // Condomínio só existe pra parte dos imóveis (casa, terreno, sala com
  // entrada própria) — o título nunca aparece sem item embaixo.
  if (lista.length === 0) return null;

  return (
    <section data-caracteristicas="condominio">
      <h2 className={`${TITULO_BLOCO} mb-4`}>Características do condomínio</h2>
      <Grade itens={lista} />
    </section>
  );
}
