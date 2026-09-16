"use client";

import { useActionState, useId, useState } from "react";
import {
  criarEmpreendimento,
  renomearEmpreendimento,
  removerEmpreendimento,
} from "@/app/app/empreendimentos/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { LIMITE_NOME_EMPREENDIMENTO } from "@/lib/empreendimento";
import type { EmpreendimentoDaLista } from "@/lib/empreendimento-consultas";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// Gestão de empreendimentos (Fase 38) — mesma anatomia de card dos
// catálogos irmãos (características, tipos de imóvel): título,
// descrição, lista de linhas e o formulário de criação no fim.
//
// Gestão SIMPLES de propósito: o empreendimento é identidade, não uma
// ficha. Nome, contagem de unidades e as duas ações. Nada de galeria,
// endereço, construtora ou estágio — esses dados continuam na unidade.

function LinhaEmpreendimento({
  empreendimento,
  podeGerenciar,
}: {
  empreendimento: EmpreendimentoDaLista;
  podeGerenciar: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const renomear = renomearEmpreendimento.bind(null, empreendimento.id);
  const remover = removerEmpreendimento.bind(null, empreendimento.id);
  const [estadoRenomear, formRenomear, renomeando] = useActionState(
    renomear,
    ESTADO_INICIAL_ACAO
  );
  const [estadoRemover, formRemover, removendo] = useActionState(
    remover,
    ESTADO_INICIAL_ACAO
  );
  const idNome = useId();

  return (
    <li className="min-w-0 border-b py-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 break-words font-medium">{empreendimento.nome}</span>
        {/* Contagem em TEXTO, com plural correto: é o dado que explica
            por que a exclusão pode ser recusada. */}
        <Badge variant="secondary" className="shrink-0">
          {empreendimento.unidades === 1
            ? "1 unidade"
            : `${empreendimento.unidades} unidades`}
        </Badge>
      </div>

      {podeGerenciar && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditando((v) => !v)}
          >
            {editando ? "Cancelar" : "Renomear"}
          </Button>
          <form action={formRemover}>
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={removendo}
            >
              {removendo ? "Excluindo..." : "Excluir"}
            </Button>
          </form>
        </div>
      )}

      {editando && (
        <form action={formRenomear} className="mt-2 space-y-2">
          <Label htmlFor={idNome} className="text-xs">
            Novo nome
          </Label>
          <Input
            id={idNome}
            name="nome"
            defaultValue={empreendimento.nome}
            maxLength={LIMITE_NOME_EMPREENDIMENTO}
            aria-invalid={estadoRenomear.fieldErrors?.nome ? true : undefined}
          />
          {estadoRenomear.fieldErrors?.nome && (
            <p className="text-xs text-destructive">{estadoRenomear.fieldErrors.nome[0]}</p>
          )}
          <Button type="submit" size="sm" disabled={renomeando}>
            {renomeando ? "Salvando..." : "Salvar nome"}
          </Button>
        </form>
      )}

      {/* Erros das duas ações, com aria-live: a recusa de exclusão
          ("tem N unidades vinculadas") é justamente o que o gestor
          precisa ler. */}
      {[estadoRenomear, estadoRemover].map((estado, i) =>
        estado.message && !estado.success ? (
          <p key={i} role="alert" className="mt-1 min-w-0 break-words text-xs text-destructive">
            {estado.message}
          </p>
        ) : null
      )}
    </li>
  );
}

export function EmpreendimentosCard({
  empreendimentos,
  podeGerenciar,
}: {
  empreendimentos: EmpreendimentoDaLista[];
  podeGerenciar: boolean;
}) {
  const [estado, formAction, pendente] = useActionState(
    criarEmpreendimento,
    ESTADO_INICIAL_ACAO
  );
  const idNovo = useId();

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="min-w-0 break-words">Empreendimentos cadastrados</CardTitle>
        <CardDescription className="min-w-0 break-words">
          Excluir um empreendimento nunca apaga imóveis — é preciso desvincular
          as unidades antes.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        {empreendimentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum empreendimento cadastrado ainda.
          </p>
        ) : (
          <ul className="text-sm">
            {empreendimentos.map((e) => (
              <LinhaEmpreendimento
                key={e.id}
                empreendimento={e}
                podeGerenciar={podeGerenciar}
              />
            ))}
          </ul>
        )}

        {podeGerenciar && (
          <form action={formAction} className="mt-4 space-y-2 border-t pt-4">
            <Label htmlFor={idNovo}>Novo empreendimento</Label>
            <div className="flex flex-wrap items-start gap-2">
              <Input
                id={idNovo}
                name="nome"
                placeholder="Ex.: Residencial Jardim das Acácias"
                maxLength={LIMITE_NOME_EMPREENDIMENTO}
                className="min-w-0 flex-1"
                aria-invalid={estado.fieldErrors?.nome ? true : undefined}
              />
              <Button type="submit" disabled={pendente}>
                {pendente ? "Criando..." : "Adicionar"}
              </Button>
            </div>
            {estado.fieldErrors?.nome && (
              <p className="text-sm text-destructive">{estado.fieldErrors.nome[0]}</p>
            )}
            {estado.message && (
              <p
                role="status"
                aria-live="polite"
                className={
                  estado.success
                    ? "text-sm text-muted-foreground"
                    : "text-sm text-destructive"
                }
              >
                {estado.message}
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
