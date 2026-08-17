"use client";

import { FormularioContato } from "@/components/FormularioContato";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

export function ModalContato({
  imovelId,
  mensagemPreenchida = "",
  whatsappHref,
  className,
  aoAbrir,
  children,
  orgSlug,
  nome,
}: {
  imovelId?: string;
  mensagemPreenchida?: string;
  whatsappHref?: string;
  className?: string;
  aoAbrir?: () => void;
  children: React.ReactNode;
  orgSlug: string;
  nome: string;
}) {
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) aoAbrir?.();
      }}
    >
      <DialogTrigger className={className}>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl p-0 max-h-[85vh] overflow-y-auto sm:max-w-2xl sm:grid sm:grid-cols-[220px_1fr]">
        <DialogTitle className="sr-only">Enviar mensagem</DialogTitle>
        <div className="bg-gray-50 rounded-t-xl p-6 flex flex-col gap-3 border-b sm:rounded-t-none sm:rounded-l-xl sm:border-b-0 sm:border-r">
          <div className="w-14 h-14 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-xl">
            {nome.charAt(0).toUpperCase()}
          </div>
          <p className="font-semibold">{nome}</p>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-link hover:underline"
            >
              Falar no WhatsApp
            </a>
          )}
        </div>

        <div className="p-6 min-w-0">
          <h2 className="font-semibold mb-4">Enviar mensagem</h2>
          <FormularioContato
            imovelId={imovelId}
            mensagemPreenchida={mensagemPreenchida}
            idPrefixo="modal-"
            orgSlug={orgSlug}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
