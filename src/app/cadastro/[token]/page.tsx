import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { verificarCadastro } from "@/lib/acesso-token";
import { ConfirmarCadastroForm } from "./ConfirmarCadastroForm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

// Confirmação do cadastro. Os três estados de falha — inexistente,
// expirado e já usado — compartilham UMA mensagem, pela mesma razão dos
// outros fluxos de token: distingui-los diria a quem tem o link se ele
// um dia foi válido.
export default async function ConfirmarCadastroPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const cadastro = await verificarCadastro(token);

  // Só depois de o token ser válido se consulta qualquer coisa: um token
  // aleatório não deve conseguir extrair nada do banco.
  const usuario = cadastro.valido
    ? await prisma.user.findUnique({
        where: { email: cadastro.email },
        select: { active: true },
      })
    : null;
  const precisaDefinirSenha = !usuario?.active;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>
            {cadastro.valido ? cadastro.orgName : "Link inválido"}
          </CardTitle>
          <CardDescription>
            {cadastro.valido
              ? precisaDefinirSenha
                ? "Escolha sua senha para criar a conta da imobiliária."
                : "Confirme para criar a conta da imobiliária com o seu acesso atual."
              : "Este link é inválido, já foi usado ou expirou."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cadastro.valido ? (
            <ConfirmarCadastroForm
              token={token}
              precisaDefinirSenha={precisaDefinirSenha}
              enderecoSite={cadastro.orgSlug}
            />
          ) : (
            <Link
              href="/cadastro"
              className="block text-center text-sm text-primary underline-offset-4 hover:underline"
            >
              Começar um novo cadastro
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
