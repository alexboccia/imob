"use client";

import { useActionState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { enviarContato } from "@/app/[orgSlug]/actions";
import { CamposAntiSpam } from "@/components/CamposAntiSpam";
import { Input } from "@/components/ui/input";
import { CampoTelefone } from "@/components/CampoTelefone";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const estadoInicial = { sucesso: false, erro: undefined as string | undefined };

export function ContatoForm({ orgSlug }: { orgSlug: string }) {
  const [estado, formAction, pendente] = useActionState(
    enviarContato.bind(null, orgSlug),
    estadoInicial
  );

  return (
    <>
      {estado.sucesso ? (
        <Alert className="border-green-200 bg-green-50 text-green-700">
          <CheckCircle2 />
          <AlertDescription className="text-green-700">
            Mensagem enviada com sucesso! Em breve entraremos em contato.
          </AlertDescription>
        </Alert>
      ) : (
        <form action={formAction} className="space-y-4">
          <CamposAntiSpam />
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" placeholder="Nome" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" placeholder="E-mail" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telefone">Telefone</Label>
            <CampoTelefone
              id="telefone"
              name="telefone"
              placeholder="Telefone/WhatsApp"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mensagem">Mensagem</Label>
            <Textarea
              id="mensagem"
              name="mensagem"
              placeholder="Mensagem"
              required
              rows={5}
            />
          </div>
          {estado.erro && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" size="lg" disabled={pendente}>
            {pendente ? "Enviando..." : "Enviar mensagem"}
          </Button>
        </form>
      )}
    </>
  );
}
