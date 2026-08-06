"use client";

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

export function ConfirmDeleteButton({
  action,
  itemLabel,
}: {
  action: () => void;
  itemLabel: string;
}) {
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
          <form action={action}>
            <Button type="submit" variant="destructive" className="w-full">
              Remover
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
