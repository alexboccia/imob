"use client";

import { useActionState } from "react";
import { redefinirSenha } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { SENHA_MINIMA, SENHA_MAXIMA } from "@/lib/senha";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function NovaSenhaForm({ token }: { token: string }) {
  const redefinirComToken = redefinirSenha.bind(null, token);
  const [estado, formAction, pendente] = useActionState(
    redefinirComToken,
    ESTADO_INICIAL_ACAO
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="senha">Nova senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          required
          minLength={SENHA_MINIMA}
          maxLength={SENHA_MAXIMA}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          Use ao menos {SENHA_MINIMA} caracteres. Uma frase longa é mais segura e mais
          fácil de lembrar que símbolos misturados.
        </p>
        <ErroCampo erros={estado.fieldErrors?.senha} />
      </div>
      {estado.message && (
        <p role="alert" className="text-sm text-destructive">
          {estado.message}
        </p>
      )}
      <Button type="submit" disabled={pendente} className="w-full">
        {pendente ? "Salvando..." : "Salvar nova senha"}
      </Button>
    </form>
  );
}
