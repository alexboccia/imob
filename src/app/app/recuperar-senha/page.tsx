import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { RecuperarSenhaForm } from "./RecuperarSenhaForm";

// Pedido de recuperação. Página pública, sem sessão — e sem nenhuma
// consulta ao banco: tudo que ela faz é apresentar um formulário.
export default function RecuperarSenhaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Recuperar senha</CardTitle>
          <CardDescription>
            Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RecuperarSenhaForm />
          <Link
            href="/app/login"
            className="block text-center text-sm text-primary underline-offset-4 hover:underline"
          >
            Voltar para o login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
