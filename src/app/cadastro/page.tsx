import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { CadastroForm } from "./CadastroForm";

export const metadata = {
  title: "Criar conta da sua imobiliária — EasyMob",
};

// Cadastro público. Nenhuma consulta ao banco: a página só apresenta o
// formulário, e tudo que decide alguma coisa acontece na action.
export default function CadastroPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Crie a conta da sua imobiliária</CardTitle>
          <CardDescription>
            Comece em minutos, sem instalar nada. Você recebe um e-mail para confirmar e já
            entra no sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CadastroForm />
          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link
              href="/app/login"
              className="text-primary underline-offset-4 hover:underline"
            >
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
