import Link from "next/link";
import { verificarTokenReset } from "@/lib/acesso-token";
import { NovaSenhaForm } from "./NovaSenhaForm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

// Definição da nova senha. Os três estados de falha — inexistente,
// expirado e já usado — compartilham UMA mensagem: distingui-los diria a
// quem tem o link se ele um dia foi válido.
export default async function RedefinirSenhaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resultado = await verificarTokenReset(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Nova senha</CardTitle>
          <CardDescription>
            {resultado.valido
              ? "Escolha a senha que você vai usar para entrar."
              : "Link inválido"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {resultado.valido ? (
            <NovaSenhaForm token={token} />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Este link é inválido, já foi usado ou expirou. Peça um novo link de
                recuperação para continuar.
              </p>
              <Link
                href="/app/recuperar-senha"
                className="block text-center text-sm text-primary underline-offset-4 hover:underline"
              >
                Pedir novo link
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
