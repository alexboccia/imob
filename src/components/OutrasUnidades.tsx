import { ImovelCard } from "@/components/ImovelCard";
import { paraImovelCard, type ImovelParaCard } from "@/lib/imovel-card";
import { TITULO_SECAO } from "@/lib/site-typography";

// Outras unidades neste empreendimento (Fase 38).
//
// O título afirma PERTENCIMENTO, e só pode ser dito porque agora existe
// identidade estrutural: Property.developmentId. Antes desta fase o
// produto só sabia que dois imóveis eram parecidos — e a seção de
// "Imóveis próximos que você pode gostar", logo abaixo, continua sendo
// exatamente isso: proximidade geográfica, com o nome honesto.
//
// As duas coexistem de propósito e NUNCA se confundem: uma responde "o
// que mais tem neste empreendimento", a outra "o que mais tem por
// perto". Um imóvel pode aparecer nas duas, e isso é correto.
//
// SERVER COMPONENT: são cards estáticos com links. Nada aqui precisa de
// estado no cliente, e transformar a seção em Client Component só para
// renderizar cartões custaria hidratação numa página que é caminho de
// SEO.
//
// O CARD é o MESMO do catálogo (ImovelCard + paraImovelCard). Ele já
// resolve preço por finalidade, ausência de foto/quartos/área (null e
// zero são ausência, nunca "0 m²"), alt, Next/Image e a URL pública via
// basePath — que é o que mantém o link correto em domínio customizado.
// Criar um card compacto próprio duplicaria essa lógica de domínio; a
// compactação vem da GRADE (4 colunas), não de um segundo componente.
export function OutrasUnidades({
  unidades,
  basePath,
  orgSlugFavorito,
}: {
  unidades: ImovelParaCard[];
  basePath: string;
  orgSlugFavorito?: string;
}) {
  // Sem outras unidades, a seção não existe — nunca um bloco vazio
  // dizendo "nenhuma outra unidade", que seria ruído numa página de
  // conversão.
  if (unidades.length === 0) return null;

  return (
    <section className="mt-16 border-t pt-8">
      <h2 className={`${TITULO_SECAO} mb-6`}>Outras unidades neste empreendimento</h2>
      {/* Até 4 colunas em telas largas (o catálogo usa 3): as unidades do
          mesmo empreendimento são comparadas entre si, e ver as quatro
          lado a lado é o ponto da seção. Abaixo disso a grade desce para
          2 e 1, como no resto do site. */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {unidades.map((unidade) => (
          <ImovelCard
            key={unidade.id}
            imovel={paraImovelCard(unidade)}
            basePath={basePath}
            orgSlugFavorito={orgSlugFavorito}
          />
        ))}
      </div>
    </section>
  );
}
