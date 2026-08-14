import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

// Deliberadamente NÃO chama requireOrganizationId() — essa função
// redireciona pra cá quando o trial expirou, então chamá-la aqui de novo
// criaria um loop de redirecionamento (mesmo racional de
// /app/suspenso/page.tsx). Usa auth() direto só pra saudação, sem depender
// do estado da organização. Nenhum dado é apagado quando o trial expira —
// só a operação normal do CRM é bloqueada até a organização mudar de
// plano (Platform Admin, ver alterarPlano).
export default async function TrialExpiradoPage() {
  const session = await auth();

  return (
    <div className="max-w-md mx-auto text-center py-16">
      <h1 className="text-2xl font-semibold mb-3">Seu período de avaliação terminou</h1>
      <p className="text-muted-foreground mb-6">
        {session?.user?.name ? `Olá, ${session.user.name}. ` : ""}
        Seus dados continuam armazenados. Escolha um plano para continuar usando o
        EasyMob — entre em contato com o suporte para ativar sua assinatura.
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/app/login" });
        }}
      >
        <Button type="submit" variant="outline">
          Sair
        </Button>
      </form>
    </div>
  );
}
