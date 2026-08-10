"use client";

import { useActionState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { enviarAnuncioProprietario } from "@/app/[orgSlug]/actions";
import { CamposAntiSpam } from "@/components/CamposAntiSpam";
import { Input } from "@/components/ui/input";
import { CampoTelefone } from "@/components/CampoTelefone";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const estadoInicial = { sucesso: false, erro: undefined as string | undefined };

export function AnuncieForm({ orgSlug }: { orgSlug: string }) {
  const [estado, formAction, pendente] = useActionState(
    enviarAnuncioProprietario.bind(null, orgSlug),
    estadoInicial
  );

  return (
    <>
      {estado.sucesso ? (
        <Alert className="border-success-muted-border bg-success-muted text-success-muted-foreground">
          <CheckCircle2 />
          <AlertDescription className="text-success-muted-foreground">
            Recebemos seus dados! Em breve um corretor entrará em contato.
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
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="descricaoImovel">Descrição do imóvel</Label>
            <Textarea
              id="descricaoImovel"
              name="descricaoImovel"
              placeholder="Descreva o imóvel (endereço, tipo, valor pretendido...)"
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
            {pendente ? "Enviando..." : "Enviar"}
          </Button>
        </form>
      )}
    </>
  );
}
