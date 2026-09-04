import {
  IconeArea,
  IconeBanheiro,
  IconeCheck,
  IconeQuartos,
  IconeSuite,
  IconeVaga,
} from "@/components/icons";
import { IconeCaracteristica } from "@/lib/caracteristicas-icones";
import { TITULO_BLOCO } from "@/lib/site-typography";

// Características do imóvel e do condomínio. Estava inline no detalhe;
// extraído porque a página de lançamento mostra exatamente as mesmas
// listas.
//
// Regra que mudou aqui: um campo numérico em ZERO deixa de virar linha.
// "Quartos: 0" e "Vagas de garagem: 0" apareciam como se fossem
// característica do imóvel — em uma lista com ícone de confirmação verde,
// zero lido rápido vira o oposto do que o dado diz. Ausência de valor
// (null) e zero passam a ter o mesmo tratamento: a linha não existe.
// Área continua exigindo valor positivo, como já exigia.

function Item({
  icon: Icone = IconeCheck,
  children,
}: {
  icon?: (props: { className?: string }) => React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2">
      <Icone className="size-4 shrink-0 text-success" />
      <span>{children}</span>
    </li>
  );
}

function ItemCatalogo({ nome }: { nome: string }) {
  return (
    <li className="flex items-center gap-2">
      <IconeCaracteristica nome={nome} className="size-4 shrink-0 text-success" />
      <span>{nome}</span>
    </li>
  );
}

const CLASSE_LISTA =
  "grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-gray-700 sm:grid-cols-2";

export type CaracteristicasProps = {
  totalArea: number | null;
  privateArea: number | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  propertyFeatures: string[];
  condoFeatures: string[];
};

// Sem contagem nenhuma e sem item de catálogo não há o que listar — o
// bloco inteiro some em vez de deixar um título com lista vazia embaixo.
function temAlgumaCaracteristica(imovel: CaracteristicasProps): boolean {
  return (
    !!imovel.totalArea ||
    !!imovel.privateArea ||
    !!imovel.bedrooms ||
    !!imovel.suites ||
    !!imovel.bathrooms ||
    !!imovel.parkingSpots ||
    imovel.propertyFeatures.length > 0
  );
}

export function CaracteristicasImovel({ imovel }: { imovel: CaracteristicasProps }) {
  if (!temAlgumaCaracteristica(imovel)) return null;

  return (
    <section>
      <h2 className={`${TITULO_BLOCO} mb-3`}>Características do imóvel</h2>
      <ul className={CLASSE_LISTA}>
        {!!imovel.totalArea && (
          <Item icon={IconeArea}>Área total: {imovel.totalArea} m²</Item>
        )}
        {!!imovel.privateArea && (
          <Item icon={IconeArea}>Área privativa: {imovel.privateArea} m²</Item>
        )}
        {!!imovel.bedrooms && <Item icon={IconeQuartos}>Quartos: {imovel.bedrooms}</Item>}
        {!!imovel.suites && <Item icon={IconeSuite}>Suítes: {imovel.suites}</Item>}
        {!!imovel.bathrooms && (
          <Item icon={IconeBanheiro}>Banheiros: {imovel.bathrooms}</Item>
        )}
        {!!imovel.parkingSpots && (
          <Item icon={IconeVaga}>Vagas de garagem: {imovel.parkingSpots}</Item>
        )}
        {imovel.propertyFeatures.map((c) => (
          <ItemCatalogo key={c} nome={c} />
        ))}
      </ul>
    </section>
  );
}

// Bloco separado: condomínio só existe pra parte dos imóveis, e o título
// nunca aparece sem item embaixo (comportamento que já era assim).
export function CaracteristicasCondominio({ itens }: { itens: string[] }) {
  if (itens.length === 0) return null;

  return (
    <section>
      <h2 className={`${TITULO_BLOCO} mb-3`}>Características do condomínio</h2>
      <ul className={CLASSE_LISTA}>
        {itens.map((c) => (
          <ItemCatalogo key={c} nome={c} />
        ))}
      </ul>
    </section>
  );
}
