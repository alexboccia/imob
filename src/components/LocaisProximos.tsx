import { IconeLocalProximo } from "@/components/IconeLocalProximo";
import {
  resumoDoLocal,
  type CategoriaLocal,
  type UnidadeDistancia,
} from "@/lib/locais-proximos";
import { TITULO_BLOCO } from "@/lib/site-typography";

// O que tem por perto (Fase 42) — ficha pública, logo depois da
// Localização: o endereço diz ONDE, esta seção diz o que há em volta.
//
// Mesma linguagem das características: grade leve de ícone + texto, sem
// card por item. A distância é um complemento da linha e só existe
// quando foi cadastrada — nunca "—", nunca "não informado".

export type LocalProximoPublico = {
  id: string;
  category: CategoriaLocal;
  name: string;
  distance: number | null;
  distanceUnit: UnidadeDistancia | null;
};

export function LocaisProximos({ locais }: { locais: LocalProximoPublico[] }) {
  if (locais.length === 0) return null;

  return (
    <section data-locais-proximos>
      <h2 className={`${TITULO_BLOCO} mb-4`}>O que tem por perto</h2>
      {/* Três por linha a partir de md. A seção vive na coluna principal
          da ficha: ~736px em md (página ainda de coluna única) e ~640px em
          lg (2/3 do grid), o que dá ~190px de texto por local — cabe
          "Farmácia · 1,2 km" numa linha, e nome longo quebra em vez de
          cortar. Entre sm e md, duas; no celular, uma. */}
      <ul className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
        {locais.map((local) => {
          // Mesmo texto do painel: "Farmácia · 350 m", ou só "Parque".
          const resumo = resumoDoLocal({
            categoria: local.category,
            distancia: local.distance,
            unidade: local.distanceUnit,
          });
          return (
            <li key={local.id} className="flex min-w-0 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                <IconeLocalProximo categoria={local.category} className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.9375rem] leading-6 font-medium break-words text-gray-900">
                  {local.name}
                </p>
                <p className="text-sm break-words text-gray-600">{resumo}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
