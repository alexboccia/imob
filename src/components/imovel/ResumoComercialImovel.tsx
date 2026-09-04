import {
  IconeArea,
  IconeBanheiro,
  IconeQuartos,
  IconeSuite,
  IconeVaga,
} from "@/components/icons";

// Faixa de leitura rápida logo abaixo da galeria: o que o visitante quer
// saber antes de decidir se lê o resto. Para um lançamento isso importa
// mais ainda — obra e prazo entram aqui, no topo, em vez de ficarem
// enterrados no meio da página.
//
// Mesma regra da Fase 2: contador em ZERO não vira item. Um "0 vagas"
// com ícone ao lado é lido como característica, não como ausência. Sem
// nenhum dado, a faixa inteira não existe.

type Item = { label: string; valor: string; Icone?: (p: { className?: string }) => React.ReactNode };

export type ResumoComercialProps = {
  totalArea: number | null;
  privateArea: number | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  // Só chegam preenchidos quando o imóvel realmente tem estágio/previsão
  // cadastrados — quem resolve isso é imovel-lancamento.ts.
  estagioObra?: string | null;
  previsaoEntrega?: string | null;
};

function montarItens(p: ResumoComercialProps): Item[] {
  const itens: Item[] = [];
  const area = p.privateArea || p.totalArea;
  if (area) {
    itens.push({
      label: p.privateArea ? "Área privativa" : "Área total",
      valor: `${area} m²`,
      Icone: IconeArea,
    });
  }
  if (p.bedrooms) itens.push({ label: p.bedrooms > 1 ? "Quartos" : "Quarto", valor: String(p.bedrooms), Icone: IconeQuartos });
  if (p.suites) itens.push({ label: p.suites > 1 ? "Suítes" : "Suíte", valor: String(p.suites), Icone: IconeSuite });
  if (p.bathrooms) itens.push({ label: p.bathrooms > 1 ? "Banheiros" : "Banheiro", valor: String(p.bathrooms), Icone: IconeBanheiro });
  if (p.parkingSpots) itens.push({ label: p.parkingSpots > 1 ? "Vagas" : "Vaga", valor: String(p.parkingSpots), Icone: IconeVaga });
  if (p.estagioObra) itens.push({ label: "Obra", valor: p.estagioObra });
  if (p.previsaoEntrega) itens.push({ label: "Entrega", valor: p.previsaoEntrega });
  return itens;
}

export function ResumoComercialImovel(props: ResumoComercialProps) {
  const itens = montarItens(props);
  if (itens.length === 0) return null;

  return (
    <section aria-label="Resumo do imóvel" className="rounded-xl border bg-secondary/40 px-4 py-4 sm:px-6">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        {itens.map(({ label, valor, Icone }) => (
          <div key={label} className="flex min-w-0 items-center gap-2.5">
            {Icone && (
              <span aria-hidden className="shrink-0 text-primary">
                <Icone className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="truncate text-sm font-semibold text-gray-900">{valor}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
