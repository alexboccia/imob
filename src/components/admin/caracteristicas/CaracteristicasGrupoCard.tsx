"use client";

import { useActionState, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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
    <Card className="min-w-0">
      {/* min-w-0 break-words no título: achado real em 375/360px — CardHeader
          é `display:grid` (ver card.tsx), e um item de grid tem
          `min-width:auto` implícito por padrão, então "Características do
          imóvel"/"do condomínio" (mais longo que qualquer título de KPI já
          testado) não quebrava linha e empurrava a coluna/o card/o
          documento pra fora do viewport (scrollWidth 424 vs innerWidth 375
          antes desta correção) — mesma classe de bug já corrigida em
          Dashboard/Imóveis, aqui no CardTitle em vez de num <h1>/badge.
          Aplicado só nesta instância (className), não no componente
          CardTitle compartilhado — usado em Dashboard/Usuários/Imóveis/
          Clientes/etc. com títulos mais curtos, sem necessidade de mudar
          o componente base. */}
      <CardHeader>
        <CardTitle className="min-w-0 break-words">{titulo}</CardTitle>
        <CardDescription>{contagemLabel}</CardDescription>
      </CardHeader>
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
  );
}
