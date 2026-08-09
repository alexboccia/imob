"use client";

import { useActionState } from "react";
import { loginPlatformAction } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function PlatformLoginPage() {
  const [estado, formAction, pendente] = useActionState(
    loginPlatformAction,
    ESTADO_INICIAL_ACAO
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-sm border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            EasyMob Platform
          </p>
          <CardTitle className="text-slate-50">Platform Admin</CardTitle>
          <CardDescription className="text-slate-400">
            Acesso restrito à equipe EasyMob
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-slate-200">
                E-mail
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                className="border-slate-700 bg-slate-800 text-slate-50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha" className="text-slate-200">
                Senha
              </Label>
              <Input
                id="senha"
                name="senha"
                type="password"
                required
                className="border-slate-700 bg-slate-800 text-slate-50"
              />
            </div>
            {estado.message && (
              <p className="text-sm text-red-400">{estado.message}</p>
            )}
            <Button type="submit" disabled={pendente} className="w-full">
              {pendente ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
