"use client";

import { useActionState, useMemo, useState } from "react";
import { Building2, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { CaracteristicaLinha } from "@/components/admin/caracteristicas/CaracteristicaLinha";
import { criarCaracteristica } from "@/app/app/caracteristicas/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { normalizarTexto } from "@/lib/texto";

// Redesenho de Características — Client Component (busca local por
// texto precisa de estado; criação usa useActionState). `opcoes` chega
// já ordenada alfabeticamente do server (mesmo critério do código
// anterior, preservado — ver page.tsx), então a busca só FILTRA, nunca
// reordena.
//
// Busca client-side de propósito: dataset por organização é
// tipicamente pequeno (dezenas de itens, não milhares — catálogo
// administrativo, não listagem de registros de negócio), então um
// round-trip ao servidor por tecla seria complexidade sem benefício real.
// `normalizarTexto` (já usado pelo mesmo catálogo no formulário de
// imóvel, SeletorCaracteristicas.tsx) garante busca case+accent-
// insensitive consistente com o resto do produto, sem reinventar regra.
//
// Fase 135 — CardTitle virou CabecalhoSecao (mesmo achado de
// acessibilidade já corrigido em Tipos de imóvel, Fase 72: CardTitle
// renderiza um <div>, sem semântica de heading — "Características do
// imóvel"/"do condomínio" nunca foram heading nenhum, só o <h1> da
// página existia). Ícone por categoria (ListChecks/Building2) e
// tom="azul", consistentes com o resto do backoffice já redesenhado.
const ICONE_POR_CATEGORIA = { PROPERTY: ListChecks, CONDO: Building2 } as const;

export function CaracteristicasGrupoCard({
  titulo,
  categoria,
  opcoes,
  podeGerenciar,
}: {
  titulo: string;
  categoria: "PROPERTY" | "CONDO";
  opcoes: { id: string; nome: string }[];
  podeGerenciar: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [estado, formAction, pendente] = useActionState(criarCaracteristica, ESTADO_INICIAL_ACAO);

  const buscaNormalizada = normalizarTexto(busca.trim());
  const visiveis = useMemo(() => {
    if (!buscaNormalizada) return opcoes;
    return opcoes.filter((o) => normalizarTexto(o.nome).includes(buscaNormalizada));
  }, [opcoes, buscaNormalizada]);

  const total = opcoes.length;
  const contagemLabel =
    buscaNormalizada && visiveis.length !== total
      ? `${visiveis.length} de ${total} ${total === 1 ? "opção" : "opções"}`
      : `${total} ${total === 1 ? "opção" : "opções"}`;

  return (
    <section className="min-w-0 space-y-4">
      <CabecalhoSecao
        icone={ICONE_POR_CATEGORIA[categoria]}
        titulo={titulo}
        tom="azul"
        descricao={contagemLabel}
      />

      <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-4">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar característica..."
          aria-label={`Buscar em ${titulo.toLowerCase()}`}
        />

        {podeGerenciar && (
          <div>
            <form action={formAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="categoria" value={categoria} />
              <Input
                name="nome"
                placeholder="Nova característica"
                required
                disabled={pendente}
                className="min-w-0 flex-1"
              />
              <Button type="submit" variant="outline" disabled={pendente} className="shrink-0">
                {pendente ? "Adicionando..." : "Adicionar"}
              </Button>
            </form>
            {!estado.success && (
              <ErroCampo erros={estado.fieldErrors?.nome ?? (estado.message ? [estado.message] : [])} />
            )}
          </div>
        )}

        {opcoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma característica cadastrada.</p>
        ) : visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma característica encontrada.</p>
        ) : (
          <ul className="space-y-0">
            {visiveis.map((opcao) => (
              <CaracteristicaLinha
                key={opcao.id}
                id={opcao.id}
                nome={opcao.nome}
                podeGerenciar={podeGerenciar}
              />
            ))}
          </ul>
        )}
      </CardContent>
      </Card>
    </section>
  );
}
