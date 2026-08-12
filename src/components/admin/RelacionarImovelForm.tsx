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

export function RelacionarImovelForm({
  pessoaId,
  imoveisDisponiveis,
}: {
  pessoaId: string;
  imoveisDisponiveis: { id: string; title: string }[];
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
    <form action={formAction} className="flex flex-col sm:flex-row gap-2">
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
      <Button type="submit" variant="outline" disabled={pendente}>
        {pendente ? "Relacionando..." : "Relacionar imóvel"}
      </Button>
    </form>
  );
}
