import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

// Deliberadamente NÃO chama requireOrganizationId() — essa função
// redireciona pra cá quando a organização está suspensa, então chamá-la
// aqui de novo criaria um loop de redirecionamento. Usa auth() direto só
// pra saudação, sem depender do estado da organização.
export default async function ContaSuspensaPage() {
  const session = await auth();

  return (
    <div className="max-w-md mx-auto text-center py-16">
      <h1 className="text-2xl font-semibold mb-3">Conta suspensa</h1>
      <p className="text-muted-foreground mb-6">
        {session?.user?.name ? `Olá, ${session.user.name}. ` : ""}
        O acesso da sua organização ao EasyMob está temporariamente suspenso.
        Nenhum dado foi apagado. Entre em contato com o suporte para
        regularizar sua conta.
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
