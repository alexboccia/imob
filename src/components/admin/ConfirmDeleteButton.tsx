"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
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
import { ESTADO_INICIAL_ACAO, type ActionState } from "@/lib/action-result";

export function ConfirmDeleteButton({
  action,
  itemLabel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  itemLabel: string;
}) {
  const [estado, formAction, pendente] = useActionState(action, ESTADO_INICIAL_ACAO);

  useEffect(() => {
    if (estado.message && !estado.success) {
      toast.error(estado.message);
    }
  }, [estado]);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="link"
            size="sm"
            className="text-destructive h-auto p-0"
          />
        }
      >
        Remover
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover &quot;{itemLabel}&quot;?</DialogTitle>
          <DialogDescription>
            Essa opção deixará de aparecer no cadastro. Itens que já a
            possuem não são afetados.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancelar
          </DialogClose>
          <form action={formAction}>
            <Button
              type="submit"
              variant="destructive"
              className="w-full"
              disabled={pendente}
            >
              Remover
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
