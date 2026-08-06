"use client";

import { siteConfig } from "@/lib/site-config";
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
}: {
  imovelId?: string;
  mensagemPreenchida?: string;
  whatsappHref?: string;
  className?: string;
  aoAbrir?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) aoAbrir?.();
      }}
    >
      <DialogTrigger className={className}>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl p-0 sm:grid sm:grid-cols-[220px_1fr]">
        <DialogTitle className="sr-only">Enviar mensagem</DialogTitle>
        <div className="bg-gray-50 rounded-t-xl p-6 flex flex-col gap-3 border-b sm:rounded-t-none sm:rounded-l-xl sm:border-b-0 sm:border-r">
          <div className="w-14 h-14 rounded-md bg-black text-white flex items-center justify-center font-bold text-xl">
            {siteConfig.nome.charAt(0).toUpperCase()}
          </div>
          <p className="font-semibold">{siteConfig.nome}</p>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              Falar no WhatsApp
            </a>
          )}
        </div>

        <div className="p-6">
          <h2 className="font-semibold mb-4">Enviar mensagem</h2>
          <FormularioContato
            imovelId={imovelId}
            mensagemPreenchida={mensagemPreenchida}
            idPrefixo="modal-"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
