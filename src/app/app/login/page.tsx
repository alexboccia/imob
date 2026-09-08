"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AvisoAcesso } from "./AvisoAcesso";
import { siteConfig } from "@/lib/site-config";
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

export default function LoginPage() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCarregando(true);
    setErro(null);

    const formData = new FormData(event.currentTarget);
    const resultado = await signIn("credentials", {
      email: formData.get("email"),
      senha: formData.get("senha"),
      redirect: false,
    });

    setCarregando(false);

    if (!resultado || resultado.error) {
      if (resultado?.code === "too_many_attempts") {
        setErro("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else {
        setErro("E-mail ou senha inválidos.");
      }
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{siteConfig.nome}</CardTitle>
          <CardDescription>Painel administrativo</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                name="senha"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <Suspense fallback={null}>
              <AvisoAcesso />
            </Suspense>
            {erro && (
              <p role="alert" className="text-destructive text-sm">
                {erro}
              </p>
            )}
            <Button type="submit" disabled={carregando} className="w-full">
              {carregando ? "Entrando..." : "Entrar"}
            </Button>
            {/* Sem esta saída, esquecer a senha significava telefonar
                para alguém. É a razão de existir da fase. */}
            <Link
              href="/app/recuperar-senha"
              className="block text-center text-sm text-primary underline-offset-4 hover:underline"
            >
              Esqueci minha senha
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
