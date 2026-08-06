import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ImovelCard } from "@/components/ImovelCard";
import { SlideshowHome } from "@/components/SlideshowHome";
import { TodosFiltrosModal } from "@/components/TodosFiltrosModal";
import { paraImovelCard } from "@/lib/imovel-card";
import { buscarDadosFiltros } from "@/lib/filtros-imoveis-data";
import { IconeBusca } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Prisma } from "@/generated/prisma/client";
import type { TipoComCategoria } from "@/lib/filtros-imoveis-data";

function BuscaHome({
  tipos,
  bairros,
  caracteristicas,
}: {
  tipos: TipoComCategoria[];
  bairros: string[];
  caracteristicas: string[];
}) {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <h2 className="text-xl font-semibold shrink-0">
          Descubra o imóvel perfeito para você
        </h2>
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          <form
            action="/imoveis"
            method="GET"
            className="flex flex-1 rounded-full overflow-hidden border bg-gray-50"
          >
            <Input
              type="text"
              name="busca"
              placeholder="Código, bairro ou empreendimento"
              className="flex-1 rounded-none border-0 bg-transparent shadow-none pl-4"
            />
            <Button type="submit" aria-label="Buscar" className="w-11 shrink-0 rounded-none">
              <IconeBusca className="w-4 h-4" />
            </Button>
          </form>
          <TodosFiltrosModal
            tipos={tipos}
            bairros={bairros}
            caracteristicas={caracteristicas}
          />
        </div>
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
          <Button
            variant="link"
            className="h-auto p-0"
            render={<Link href={verTudoHref} />}
          >
            Ver tudo
          </Button>
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

  const [imoveisSlideshow, lancamentos, destaques, oportunidades, dadosFiltros] =
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
      buscarDadosFiltros(),
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
            <Button size="lg" className="mt-8" render={<Link href="/imoveis" />}>
              Ver imóveis disponíveis
            </Button>
          </div>
        </section>
      )}

      <BuscaHome
        tipos={dadosFiltros.tipos}
        bairros={dadosFiltros.bairros}
        caracteristicas={dadosFiltros.caracteristicas}
      />

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
