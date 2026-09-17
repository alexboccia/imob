"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ImovelCard } from "@/components/ImovelCard";
import { buttonVariants } from "@/components/ui/button";
import { IconeCoracao } from "@/components/icons";
import { favoritosMaisRecentesPrimeiro, idImovelValido } from "@/lib/favoritos";
import { removerFavorito, useFavoritos } from "@/lib/favoritos-store";
import type { ImovelFavorito } from "@/lib/favoritos-data";
import { cn } from "@/lib/utils";

// Lista da central de favoritos (Fase 49).
//
// Fonte: o store do navegador (o mesmo do Salvar da ficha e do contador
// do header). Os DADOS vêm do servidor, uma consulta em lote só para os
// ids que ainda não foram perguntados — remover não pergunta nada, só
// some da lista; um favorito novo (outra aba) dispara a consulta dele.
//
// Estados: "ainda não li o navegador" e "consultando" mostram esqueletos
// com a forma do card; vazio só aparece quando se SABE que está vazio.

const GRADE = "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3";

type Estado = {
  imoveis: Map<string, ImovelFavorito>;
  consultados: Set<string>;
};

export function ListaFavoritos({ orgSlug, basePath }: { orgSlug: string; basePath: string }) {
  const salvos = useFavoritos(orgSlug);
  // Mais recente primeiro; lixo do storage nunca sai do navegador.
  const ids = useMemo(
    () => (salvos ? favoritosMaisRecentesPrimeiro(salvos).filter(idImovelValido) : null),
    [salvos]
  );
  const [estado, setEstado] = useState<Estado>({ imoveis: new Map(), consultados: new Set() });
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [aviso, setAviso] = useState("");

  const pendentes = useMemo(
    () => (ids ?? []).filter((id) => !estado.consultados.has(id)),
    [ids, estado.consultados]
  );
  const chavePendentes = JSON.stringify(pendentes);

  useEffect(() => {
    const pedir: string[] = JSON.parse(chavePendentes);
    if (pedir.length === 0) return;
    const controle = new AbortController();
    fetch("/api/imoveis/favoritos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgSlug, ids: pedir }),
      signal: controle.signal,
    })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        const { imoveis } = (await resposta.json()) as { imoveis: ImovelFavorito[] };
        setEstado((anterior) => ({
          imoveis: new Map([...anterior.imoveis, ...imoveis.map((i) => [i.id, i] as const)]),
          consultados: new Set([...anterior.consultados, ...pedir]),
        }));
        setErro(false);
      })
      .catch(() => {
        if (!controle.signal.aborted) setErro(true);
      });
    return () => controle.abort();
  }, [chavePendentes, orgSlug, tentativa]);

  const visiveis = (ids ?? []).flatMap((id) => {
    const imovel = estado.imoveis.get(id);
    return imovel ? [imovel] : [];
  });

  function remover(imovel: ImovelFavorito) {
    // O foco não pode cair no <body>: vai para o próximo "remover" (ou o
    // anterior); sem nenhum, para a saída do estado vazio.
    const posicao = visiveis.findIndex((i) => i.id === imovel.id);
    const vizinho = visiveis[posicao + 1] ?? visiveis[posicao - 1];
    removerFavorito(orgSlug, imovel.id);
    setAviso(`${imovel.titulo} removido dos favoritos.`);
    requestAnimationFrame(() => {
      const alvo = vizinho
        ? document.querySelector<HTMLElement>(`[data-remover-favorito="${CSS.escape(vizinho.id)}"]`)
        : document.querySelector<HTMLElement>("[data-explorar-imoveis]");
      alvo?.focus();
    });
  }

  const carregando = ids === null || (!erro && pendentes.length > 0 && visiveis.length === 0);

  let conteudo: React.ReactNode;
  if (carregando) {
    conteudo = (
      <div className={GRADE} data-favoritos-carregando>
        {Array.from({ length: Math.min(Math.max(pendentes.length, 1), 3) }, (_, i) => (
          <EsqueletoCard key={i} />
        ))}
      </div>
    );
  } else if (erro && visiveis.length === 0) {
    conteudo = <ErroFavoritos aoTentar={() => setTentativa((t) => t + 1)} />;
  } else if (visiveis.length === 0) {
    conteudo = <FavoritosVazio basePath={basePath} />;
  } else {
    conteudo = (
      <>
        {erro && <ErroFavoritos aoTentar={() => setTentativa((t) => t + 1)} />}
        <ul className={cn(GRADE, erro && "mt-6")} data-lista-favoritos>
          {visiveis.map((imovel) => (
            <li key={imovel.id} data-favorito={imovel.id}>
              <ImovelCard
                imovel={imovel}
                basePath={basePath}
                situacao={imovel.situacao}
                acao={
                  <button
                    type="button"
                    data-remover-favorito={imovel.id}
                    aria-label={`Remover ${imovel.titulo} dos favoritos`}
                    title="Remover dos favoritos"
                    onClick={() => remover(imovel)}
                    className="flex size-10 items-center justify-center rounded-full bg-white/95 text-primary shadow-sm outline-none transition-colors hover:bg-white focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <IconeCoracao preenchido className="size-5" />
                  </button>
                }
              />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section aria-label="Imóveis salvos" aria-busy={carregando}>
      {conteudo}
      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </section>
  );
}

function EsqueletoCard() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl border border-gray-200 bg-white"
      data-esqueleto-card
    >
      <div className="aspect-[4/3] animate-pulse bg-gray-100" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-1/3 animate-pulse rounded bg-gray-100" />
        <div className="h-5 w-4/5 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
        <div className="h-6 w-2/5 animate-pulse rounded bg-gray-100" />
      </div>
    </div>
  );
}

function FavoritosVazio({ basePath }: { basePath: string }) {
  return (
    <div
      data-favoritos-vazio
      className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <IconeCoracao className="size-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-gray-900">Nenhum imóvel salvo ainda</h2>
      <p className="mt-2 max-w-sm text-gray-500">
        Salve os imóveis que mais gostar para encontrá-los facilmente aqui.
      </p>
      <Link
        href={`${basePath}/imoveis`}
        data-explorar-imoveis
        className={cn(buttonVariants(), "mt-6 h-10 px-5")}
      >
        Explorar imóveis
      </Link>
    </div>
  );
}

function ErroFavoritos({ aoTentar }: { aoTentar: () => void }) {
  return (
    <div
      role="alert"
      data-favoritos-erro
      className="flex flex-col items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-gray-700">Não foi possível carregar seus favoritos agora.</p>
      <button
        type="button"
        onClick={aoTentar}
        className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}
      >
        Tentar novamente
      </button>
    </div>
  );
}
