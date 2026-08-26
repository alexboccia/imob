"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { removerTipoImovel } from "@/app/app/tipos-imovel/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// Redesenho de Tipos de Imóvel — componente NOVO e específico da feature.
// O antigo ConfirmDeleteButton compartilhado tinha esta tela como único
// consumidor real (grep confirmado) e foi removido nesta tarefa. Mesmo
// padrão de botão-ícone + Dialog de confirmação já usado em
// CaracteristicaLinha.tsx, pra manter consistência visual entre os dois
// catálogos administrativos.
export function TipoImovelLinha({
  id,
  nome,
  podeGerenciar,
}: {
  id: string;
  nome: string;
  podeGerenciar: boolean;
}) {
  const [open, setOpen] = useState(false);
  const removerComId = removerTipoImovel.bind(null, id);
  const [estado, formAction, pendente] = useActionState(removerComId, ESTADO_INICIAL_ACAO);

  // Sucesso não fecha o dialog explicitamente por setState — a Server
  // Action já chama revalidatePath, então o item some da lista do Server
  // Component pai e esta linha (com o dialog) desmonta sozinha, mesmo
  // comportamento do ConfirmDeleteButton pré-existente.
  useEffect(() => {
    if (!estado.success && estado.message) {
      toast.error(estado.message);
    }
  }, [estado]);

  return (
    <li className="flex min-w-0 items-center justify-between gap-2 py-1.5 text-sm border-b last:border-b-0">
      <span className="min-w-0 break-words">{nome}</span>
      {podeGerenciar && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 focus-visible:text-destructive"
                aria-label={`Remover tipo de imóvel "${nome}"`}
              />
            }
          >
            <Trash2 className="size-4" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remover tipo de imóvel?</DialogTitle>
              <DialogDescription>
                &quot;{nome}&quot; deixará de aparecer como opção para novos
                cadastros. Imóveis que já usam esse tipo não são alterados.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <form action={formAction}>
                <Button type="submit" variant="destructive" className="w-full" disabled={pendente}>
                  {pendente ? "Removendo..." : "Remover"}
                </Button>
              </form>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
}
