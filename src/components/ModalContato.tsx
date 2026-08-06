"use client";

import { useActionState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { enviarContato } from "@/app/(public)/actions";
import { siteConfig } from "@/lib/site-config";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const estadoInicial = { sucesso: false, erro: undefined as string | undefined };

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
  const [estado, formAction, pendente] = useActionState(
    enviarContato,
    estadoInicial
  );

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

          {estado.sucesso ? (
            <Alert className="border-green-200 bg-green-50 text-green-700">
              <CheckCircle2 />
              <AlertDescription className="text-green-700">
                Mensagem enviada com sucesso! Em breve entraremos em contato.
              </AlertDescription>
            </Alert>
          ) : (
            <form action={formAction} className="space-y-3">
              {imovelId && (
                <input type="hidden" name="imovelId" value={imovelId} />
              )}
              <div className="space-y-1">
                <Label htmlFor="nome-modal">Nome</Label>
                <Input id="nome-modal" name="nome" placeholder="Nome" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="telefone-modal">Telefone</Label>
                <Input
                  id="telefone-modal"
                  name="telefone"
                  placeholder="Telefone"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email-modal">E-mail</Label>
                <Input
                  id="email-modal"
                  name="email"
                  type="email"
                  placeholder="E-mail"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mensagem-modal">Mensagem</Label>
                <Textarea
                  id="mensagem-modal"
                  name="mensagem"
                  required
                  rows={4}
                  defaultValue={mensagemPreenchida}
                />
              </div>
              {estado.erro && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>{estado.erro}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={pendente} className="w-full">
                {pendente ? "Enviando..." : "Enviar mensagem"}
              </Button>
              <p className="text-xs text-gray-400">
                Seus dados serão usados apenas para retornarmos seu contato
                {imovelId ? " sobre este imóvel" : ""}.
              </p>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
