"use client";

import { useActionState } from "react";
import { pedirRecuperacaoSenha } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function RecuperarSenhaForm() {
  const [estado, formAction, pendente] = useActionState(pedirRecuperacaoSenha, {
    enviado: false,
  });

  // UM ÚNICO estado de sucesso, sem variação. A frase é condicional de
  // propósito ("se existir uma conta"): ela é verdadeira nos dois casos e
  // não confirma nem nega que o e-mail digitado está cadastrado.
  if (estado.enviado) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Se existir uma conta com esse e-mail, enviamos as instruções para criar uma nova
        senha. Verifique também a caixa de spam.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <Button type="submit" disabled={pendente} className="w-full">
        {pendente ? "Enviando..." : "Enviar link de recuperação"}
      </Button>
    </form>
  );
}
