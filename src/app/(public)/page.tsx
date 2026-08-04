import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ImovelCard } from "@/components/ImovelCard";
import { SlideshowHome } from "@/components/SlideshowHome";
import { paraImovelCard } from "@/lib/imovel-card";
import { IconeBusca, IconeFiltros } from "@/components/icons";
import type { Prisma } from "@/generated/prisma/client";

function BuscaHome() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <h2 className="text-xl font-semibold shrink-0">
          Encontre seu próximo imóvel
        </h2>
        <form
          action="/imoveis"
          method="GET"
          className="flex flex-1 flex-col sm:flex-row gap-3"
        >
          <div className="flex flex-1 rounded-md overflow-hidden border bg-gray-50">
            <input
              type="text"
              name="busca"
              placeholder="Código, bairro ou empreendimento"
              className="flex-1 bg-transparent px-4 py-2.5 text-sm outline-none placeholder:text-gray-400"
            />
            <button
              type="submit"
              aria-label="Buscar"
              className="w-11 shrink-0 bg-black text-white flex items-center justify-center hover:bg-gray-800 active:bg-gray-900 transition-colors"
            >
              <IconeBusca className="w-4 h-4" />
            </button>
          </div>
          <Link
            href="/imoveis"
            className="flex items-center justify-center gap-2 border rounded-md px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors shrink-0"
          >
            <IconeFiltros className="w-4 h-4" />
            Ver todos os filtros
          </Link>
        </form>
      </div>
    </section>
  );
}

function buscarImoveis(
  where: Prisma.ImovelWhereInput,
  take: number,
  orderBy: Prisma.ImovelOrderByWithRelationInput = { publicadoEm: "desc" }
) {
  return prisma.imovel.findMany({
    where,
    orderBy,
    take,
    include: {
      midias: {
        where: { tipo: "FOTO" },
        orderBy: [{ ehCapa: "desc" }, { ordem: "asc" }],
        take: 5,
      },
    },
  });
}

function SecaoImoveis({
  titulo,
  imoveis,
  verTudoHref,
}: {
  titulo: string;
  imoveis: ReturnType<typeof paraImovelCard>[];
  verTudoHref?: string;
}) {
  if (imoveis.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">{titulo}</h2>
        {verTudoHref && (
          <Link
            href={verTudoHref}
            className="text-sm font-medium hover:underline"
          >
            Ver tudo
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {imoveis.map((imovel) => (
          <ImovelCard key={imovel.id} imovel={imovel} />
        ))}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const ultimosCadastrados = { criadoEm: "desc" } as const;

  const [imoveisSlideshow, lancamentos, destaques, oportunidades] =
    await Promise.all([
      buscarImoveis({ status: "DISPONIVEL", slideshow: true }, 10),
      buscarImoveis(
        { status: "DISPONIVEL", lancamento: true },
        3,
        ultimosCadastrados
      ),
      buscarImoveis(
        { status: "DISPONIVEL", destaque: true },
        3,
        ultimosCadastrados
      ),
      buscarImoveis(
        { status: "DISPONIVEL", oportunidade: true },
        3,
        ultimosCadastrados
      ),
    ]);

  const temRotulos =
    lancamentos.length > 0 || destaques.length > 0 || oportunidades.length > 0;

  const geral = temRotulos
    ? []
    : await buscarImoveis({ status: "DISPONIVEL" }, 6);

  return (
    <div>
      {imoveisSlideshow.length > 0 ? (
        <SlideshowHome
          imoveis={imoveisSlideshow.map((imovel) => ({
            id: imovel.id,
            titulo: imovel.titulo,
            tipo: imovel.tipo,
            finalidade: imovel.finalidade,
            bairro: imovel.bairro,
            cidade: imovel.cidade,
            estado: imovel.estado,
            preco: imovel.preco?.toString() ?? null,
            precoAluguel: imovel.precoAluguel?.toString() ?? null,
            midias: imovel.midias.map((m) => ({ url: m.url })),
          }))}
        />
      ) : (
        <section className="border-b bg-gray-50">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center">
            <h1 className="text-3xl sm:text-4xl font-semibold">
              Encontre o imóvel ideal para comprar ou alugar
            </h1>
            <p className="mt-4 text-gray-600">
              Apartamentos, casas e imóveis comerciais selecionados para você.
            </p>
            <Link
              href="/imoveis"
              className="inline-block mt-8 rounded-md bg-black text-white px-6 py-3 text-sm font-medium hover:bg-gray-800 active:bg-gray-900 transition-colors"
            >
              Ver imóveis disponíveis
            </Link>
          </div>
        </section>
      )}

      <BuscaHome />

      <SecaoImoveis
        titulo="Lançamentos"
        imoveis={lancamentos.map(paraImovelCard)}
        verTudoHref="/imoveis?lancamento=1"
      />
      <SecaoImoveis
        titulo="Destaques"
        imoveis={destaques.map(paraImovelCard)}
        verTudoHref="/imoveis?destaque=1"
      />
      <SecaoImoveis
        titulo="Oportunidades"
        imoveis={oportunidades.map(paraImovelCard)}
        verTudoHref="/imoveis?oportunidade=1"
      />

      {temRotulos ? null : geral.length === 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-xl font-semibold mb-6">Imóveis disponíveis</h2>
          <p className="text-gray-500">
            Nenhum imóvel publicado ainda. Assim que forem cadastrados no
            painel administrativo, eles aparecerão aqui.
          </p>
        </section>
      ) : (
        <SecaoImoveis
          titulo="Imóveis disponíveis"
          imoveis={geral.map(paraImovelCard)}
          verTudoHref="/imoveis"
        />
      )}
    </div>
  );
}
