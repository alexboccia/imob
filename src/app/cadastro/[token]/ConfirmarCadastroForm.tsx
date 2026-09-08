"use client";

import { useActionState } from "react";
import { confirmarCadastro } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { SENHA_MINIMA, SENHA_MAXIMA } from "@/lib/senha";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function ConfirmarCadastroForm({
  token,
  // Quem já tem identidade ativa não vê campo de senha: abrir uma
  // segunda imobiliária não é motivo para trocar a credencial dela.
  precisaDefinirSenha,
  enderecoSite,
}: {
  token: string;
  precisaDefinirSenha: boolean;
  enderecoSite: string;
}) {
  const confirmarComToken = confirmarCadastro.bind(null, token);
  const [estado, formAction, pendente] = useActionState(
    confirmarComToken,
    ESTADO_INICIAL_ACAO
  );

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Endereço do seu site:{" "}
        <span className="font-medium text-foreground">/{enderecoSite}</span>
      </p>

      {precisaDefinirSenha ? (
        <div className="space-y-1.5">
          <Label htmlFor="senha">Sua senha</Label>
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
      ) : (
        <p className="text-sm text-muted-foreground">
          Você já tem uma conta no EasyMob. Sua senha continua a mesma — esta confirmação
          apenas cria a nova imobiliária com você como proprietário.
        </p>
      )}

      {estado.message && (
        <p role="alert" className="text-sm text-destructive">
          {estado.message}
        </p>
      )}

      <Button type="submit" disabled={pendente} className="w-full">
        {pendente ? "Criando..." : "Criar minha imobiliária"}
      </Button>
    </form>
  );
}
