"use client";

import { useActionState } from "react";
import { definirSenhaConvite } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function DefinirSenhaForm({ token }: { token: string }) {
  const definirComToken = definirSenhaConvite.bind(null, token);
  const [estado, formAction, pendente] = useActionState(
    definirComToken,
    ESTADO_INICIAL_ACAO
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="senha">Nova senha</Label>
        <Input id="senha" name="senha" type="password" required minLength={6} />
        <ErroCampo erros={estado.fieldErrors?.senha} />
      </div>
      {estado.message && (
        <p className="text-sm text-destructive">{estado.message}</p>
      )}
      <Button type="submit" disabled={pendente} className="w-full">
        {pendente ? "Ativando..." : "Ativar minha conta"}
      </Button>
    </form>
  );
}
