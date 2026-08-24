"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { limparMidiasOrfas } from "@/app/app/manutencao/actions";
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

export function LimparMidiasButton() {
  const [open, setOpen] = useState(false);
  const [resultado, setResultado] = useState<{
    totalObjetos: number;
    totalRemovidas: number;
  } | null>(null);
  const [pendente, startTransition] = useTransition();

  function executar() {
    startTransition(async () => {
      try {
        const res = await limparMidiasOrfas();
        setResultado(res);
        setOpen(false);
        toast.success(
          res.totalRemovidas > 0
            ? `${res.totalRemovidas} foto${res.totalRemovidas === 1 ? "" : "s"} não utilizada${res.totalRemovidas === 1 ? "" : "s"} foi(ram) removida(s).`
            : "Limpeza concluída com sucesso. Nenhuma foto não utilizada encontrada."
        );
      } catch {
        toast.error("A limpeza não pôde ser concluída.");
      }
    });
  }

  return (
    <div className="min-w-0 space-y-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button type="button" />}>
          Limpar fotos não utilizadas
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Limpar fotos não utilizadas?</DialogTitle>
            <DialogDescription>
              Serão removidas apenas fotos sem vínculo com imóveis e enviadas
              há mais de 24 horas. Arquivos utilizados por imóveis não serão
              afetados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={executar}
              disabled={pendente}
            >
              {pendente ? "Limpando..." : "Confirmar limpeza"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {resultado && (
        <p className="min-w-0 break-words text-sm text-muted-foreground">
          {resultado.totalRemovidas} de {resultado.totalObjetos} arquivo(s)
          verificado(s) no storage foram removidos por não estarem
          vinculados a nenhum imóvel.
        </p>
      )}
    </div>
  );
}
