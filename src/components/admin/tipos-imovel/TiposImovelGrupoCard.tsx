"use client";

import { useActionState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { TipoImovelLinha } from "@/components/admin/tipos-imovel/TipoImovelLinha";
import { criarTipoImovel } from "@/app/app/tipos-imovel/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// Redesenho de Tipos de Imóvel — mesmo padrão visual/estrutural do
// CaracteristicasGrupoCard (Card com CardHeader/CardTitle/CardDescription,
// form de criação inline, lista com linha dedicada). `opcoes` chega já
// ordenada alfabeticamente do server (mesmo critério do código anterior,
// preservado — ver page.tsx). Sem busca client-side aqui: não fazia parte
// do pedido para esta tela (diferente de Características), e o dataset é
// tipicamente pequeno o bastante (opções de tipo, não registros de
// negócio) pra não precisar.
export function TiposImovelGrupoCard({
  titulo,
  categoria,
  opcoes,
  podeGerenciar,
}: {
  titulo: string;
  categoria: "RESIDENTIAL" | "COMMERCIAL";
  opcoes: { id: string; nome: string }[];
  podeGerenciar: boolean;
}) {
  const [estado, formAction, pendente] = useActionState(criarTipoImovel, ESTADO_INICIAL_ACAO);
  const total = opcoes.length;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="min-w-0 break-words">{titulo}</CardTitle>
        <CardDescription>{total === 1 ? "1 tipo cadastrado" : `${total} tipos cadastrados`}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {podeGerenciar && (
          <div>
            <form action={formAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="categoria" value={categoria} />
              <Input
                name="nome"
                placeholder="Novo tipo de imóvel"
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
          <p className="text-sm text-muted-foreground">Nenhum tipo cadastrado.</p>
        ) : (
          <ul className="max-h-96 space-y-0 overflow-y-auto">
            {opcoes.map((opcao) => (
              <TipoImovelLinha
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
