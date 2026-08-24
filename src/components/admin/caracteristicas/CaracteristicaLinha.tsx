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
import { removerCaracteristica } from "@/app/app/caracteristicas/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";

// Redesenho de Características — componente NOVO e específico da feature,
// não uma extensão do ConfirmDeleteButton/NovoItemCatalogoForm
// compartilhados (usados também por /app/tipos-imovel). Duplica a lógica
// pequena do dialog de confirmação de propósito, pra manter zero blast
// radius sobre Tipos de Imóvel — ver relatório final, seção "blast
// radius".
//
// Botão-ícone discreto em vez do menu "⋯": única ação real por item é
// remover — um menu de 1 item só adicionaria indireção sem ganho (a
// própria tarefa sanciona essa alternativa explicitamente quando o menu
// não agrega). `text-muted-foreground` em repouso, só fica vermelho no
// hover/focus — resolve o "vermelho dominando a lista inteira" do design
// anterior sem esconder a ação.
export function CaracteristicaLinha({
  id,
  nome,
  podeGerenciar,
}: {
  id: string;
  nome: string;
  podeGerenciar: boolean;
}) {
  const [open, setOpen] = useState(false);
  const removerComId = removerCaracteristica.bind(null, id);
  const [estado, formAction, pendente] = useActionState(removerComId, ESTADO_INICIAL_ACAO);

  // Sucesso não fecha o dialog explicitamente por setState — a Server
  // Action já chama revalidatePath, então o item some da lista do
  // Server Component pai e esta linha (com o dialog) desmonta sozinha,
  // mesmo comportamento do ConfirmDeleteButton pré-existente.
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
                aria-label={`Remover característica "${nome}"`}
              />
            }
          >
            <Trash2 className="size-4" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remover característica?</DialogTitle>
              <DialogDescription>
                &quot;{nome}&quot; deixará de aparecer como opção para novos
                cadastros. Imóveis que já possuem essa característica não
                serão alterados.
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
