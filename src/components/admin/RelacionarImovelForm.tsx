"use client";

import { useActionState } from "react";
import { criarInteressePessoa } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SeletorResponsavel } from "@/components/admin/SeletorResponsavel";
import type { OpcaoResponsavel } from "@/lib/responsavel-negociacao";

export function RelacionarImovelForm({
  pessoaId,
  imoveisDisponiveis,
  membros,
  membroAtualId,
}: {
  pessoaId: string;
  imoveisDisponiveis: { id: string; title: string }[];
  // Fase 11 — membros ativos da organização e o vínculo de quem está
  // logado, para o seletor de responsável nascer preenchido com ele.
  membros: OpcaoResponsavel[];
  membroAtualId?: string | null;
}) {
  const acao = criarInteressePessoa.bind(null, pessoaId);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);

  if (imoveisDisponiveis.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum imóvel disponível pra relacionar.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      {estado.message && !estado.success && (
        <Alert variant="destructive" className="sm:order-3 sm:basis-full">
          <AlertDescription>{estado.message}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5 w-full sm:max-w-sm">
        <Label htmlFor="propertyId" className="sr-only">
          Imóvel
        </Label>
        <Select name="propertyId">
          <SelectTrigger id="propertyId" className="w-full">
            <SelectValue placeholder="Selecione um imóvel" />
          </SelectTrigger>
          <SelectContent>
            {imoveisDisponiveis.map((imovel) => (
              <SelectItem key={imovel.id} value={imovel.id}>
                {imovel.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Fase 11 — nasce com o membro logado selecionado, e ele pode
          trocar ANTES de salvar: quem cria costuma ser quem assume, mas
          não é uma regra que o produto possa afirmar sozinho. Trocar
          aqui é mais barato que transferir depois. */}
      <div className="w-full sm:max-w-xs">
        <SeletorResponsavel
          id="responsavelId"
          membros={membros}
          valorInicial={membroAtualId ?? ""}
          rotuloVazio="Sem responsável"
        />
      </div>
      <Button type="submit" variant="outline" disabled={pendente}>
        {pendente ? "Relacionando..." : "Relacionar imóvel"}
      </Button>
    </form>
  );
}
