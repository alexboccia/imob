import { Badge } from "@/components/ui/badge";
import { custosPublicos, precosPublicos } from "@/lib/valores-publicos";

// Preços e custos recorrentes da ficha pública.
//
// Fase 52 — voltou a ter um lugar só: o card lateral da ficha. A
// variante "cabecalho" (faixa larga, preços lado a lado) existia para o
// bloco comercial do topo, que saiu junto com ele.
//
// Valores só aparecem quando existem de verdade. Nada de "sob consulta"
// inventado: sem preço nem custo cadastrado, o componente não renderiza.

export type ValoresImovel = {
  price: unknown;
  rentPrice: unknown;
  condoFee: unknown;
  propertyTax: unknown;
  purpose: string;
};

export function ValoresDoImovel({ imovel }: { imovel: ValoresImovel }) {
  const precos = precosPublicos(imovel);
  const custos = custosPublicos(imovel);
  if (precos.length === 0 && custos.length === 0) return null;

  return (
    <div data-valores-imovel="lateral" className="space-y-2">
      {precos.length > 0 && (
        <div className="space-y-2">
          {precos.map((preco) => (
            <div key={preco.chave} data-preco={preco.chave}>
              {preco.rotulo && (
                <Badge variant="secondary" className="mb-1">
                  {preco.rotulo}
                </Badge>
              )}
              <p className="text-3xl font-semibold tracking-tight whitespace-nowrap text-gray-900">
                {preco.valor}
                {preco.sufixo && (
                  <span className="text-sm font-normal text-gray-500">{preco.sufixo}</span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}
      {custos.length > 0 && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-sm text-gray-500">
          {custos.map((custo) => (
            <div key={custo.chave} className="flex gap-1.5">
              <dt>{custo.rotulo}:</dt>
              <dd>{custo.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
