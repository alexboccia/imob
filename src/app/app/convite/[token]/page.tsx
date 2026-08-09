import { verificarConvite } from "@/lib/platform/invite";
import { DefinirSenhaForm } from "./DefinirSenhaForm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resultado = await verificarConvite(token);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>EasyMob</CardTitle>
          <CardDescription>
            {resultado.valido
              ? "Defina sua senha para ativar sua conta"
              : "Convite inválido"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resultado.valido ? (
            <DefinirSenhaForm token={token} />
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              Este link de convite é inválido, já foi usado ou expirou. Entre
              em contato com quem enviou o convite para gerar um novo.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
