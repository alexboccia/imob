import { prisma } from "@/lib/prisma";
import { verificarConvite } from "@/lib/acesso-token";
import { DefinirSenhaForm } from "./DefinirSenhaForm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

// Aceitação de convite. Estados possíveis, todos com a MESMA aparência
// para o que não deve ser distinguido:
//
//   inválido / expirado / já usado  -> uma única mensagem, sempre igual
//   válido, sem senha definida      -> formulário de primeira senha
//   válido, com identidade ativa    -> aceitar o vínculo, sem senha
//
// Nenhuma consulta de organização acontece antes de o token ser válido:
// um token aleatório não deve conseguir extrair o nome de imobiliária
// nenhuma.
export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resultado = await verificarConvite(token);

  const contexto = resultado.valido
    ? await prisma.user
        .findUnique({
          where: { id: resultado.userId },
          select: { active: true },
        })
        .then(async (usuario) => {
          if (!usuario) return null;
          const organizacao = await prisma.organization.findUnique({
            where: { id: resultado.organizationId },
            select: { name: true },
          });
          return { precisaDefinirSenha: !usuario.active, organizacao };
        })
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>EasyMob</CardTitle>
          <CardDescription>
            {contexto
              ? contexto.precisaDefinirSenha
                ? "Defina sua senha para ativar sua conta"
                : `Aceite o convite para ${contexto.organizacao?.name ?? "a imobiliária"}`
              : "Convite inválido"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contexto ? (
            <DefinirSenhaForm
              token={token}
              precisaDefinirSenha={contexto.precisaDefinirSenha}
              nomeOrganizacao={contexto.organizacao?.name ?? null}
            />
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Este link de convite é inválido, já foi usado ou expirou. Peça um novo
              convite a quem administra a imobiliária.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
