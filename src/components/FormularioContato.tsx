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

export function FormularioContato({
  imovelId,
  mensagemPreenchida = "",
  idPrefixo = "",
  orgSlug,
}: {
  imovelId?: string;
  mensagemPreenchida?: string;
  idPrefixo?: string;
  orgSlug: string;
}) {
  const [estado, formAction, pendente] = useActionState(
    enviarContato.bind(null, orgSlug),
    estadoInicial
  );

  if (estado.sucesso) {
    return (
      <Alert className="border-success-muted-border bg-success-muted text-success-muted-foreground">
        <CheckCircle2 />
        <AlertDescription className="text-success-muted-foreground">
          Mensagem enviada com sucesso! Em breve entraremos em contato.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <CamposAntiSpam />
      {imovelId && <input type="hidden" name="imovelId" value={imovelId} />}
      <div className="space-y-1">
        <Label htmlFor={`${idPrefixo}nome`}>Nome</Label>
        <Input id={`${idPrefixo}nome`} name="nome" placeholder="Nome" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefixo}telefone`}>Telefone</Label>
        <CampoTelefone
          id={`${idPrefixo}telefone`}
          name="telefone"
          placeholder="Telefone"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefixo}email`}>E-mail</Label>
        <Input
          id={`${idPrefixo}email`}
          name="email"
          type="email"
          placeholder="E-mail"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefixo}mensagem`}>Mensagem</Label>
        <Textarea
          id={`${idPrefixo}mensagem`}
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
  );
}
