"use client";

import { useState } from "react";
import { IconeBusca } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CampoBuscaImoveis } from "@/components/CampoBuscaImoveis";
import { TodosFiltrosModal } from "@/components/TodosFiltrosModal";
import type { TipoComCategoria } from "@/lib/filtros-imoveis-data";

export function BuscaHome({
  tipos,
  bairros,
  caracteristicas,
  orgSlug,
  basePath,
}: {
  tipos: TipoComCategoria[];
  bairros: string[];
  caracteristicas: string[];
  orgSlug: string;
  basePath: string;
}) {
  const [busca, setBusca] = useState("");

  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <h2 className="text-xl font-semibold shrink-0">
          Descubra o imóvel perfeito para você
        </h2>
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          <form
            action={`${basePath}/imoveis`}
            method="GET"
            className="flex flex-1 gap-2"
          >
            <CampoBuscaImoveis
              value={busca}
              onChange={setBusca}
              name="busca"
              className="flex-1"
              orgSlug={orgSlug}
              basePath={basePath}
            />
            <Button type="submit" aria-label="Buscar" size="icon" className="shrink-0">
              <IconeBusca className="w-4 h-4" />
            </Button>
          </form>
          <TodosFiltrosModal
            tipos={tipos}
            bairros={bairros}
            caracteristicas={caracteristicas}
            orgSlug={orgSlug}
            basePath={basePath}
          />
        </div>
      </div>
    </section>
  );
}
