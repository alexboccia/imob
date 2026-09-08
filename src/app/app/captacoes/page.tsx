import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { hasModule } from "@/lib/entitlements";
import { temPapel, PAPEIS_RESOLUCAO_IDENTIDADE } from "@/lib/authorization";
import { buscarFusoOrganizacao } from "@/lib/fuso-organizacao";
import {
  buscarCaptacoesPendentes,
  contarCaptacoesPendentes,
} from "@/lib/captacao-pendente";
import { CaptacoesPendentes } from "@/components/admin/CaptacoesPendentes";

// Fila de identificação (Fase 24). A autorização é verificada AQUI, no
// servidor, antes de qualquer consulta — e novamente dentro da action.
// Esconder o item de menu não é controle de acesso.
export default async function CaptacoesPage() {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) redirect("/app");
  if (!temPapel(session.user.role, PAPEIS_RESOLUCAO_IDENTIDADE)) redirect("/app");

  const fuso = await buscarFusoOrganizacao(organizationId);
  const [captacoes, total] = await Promise.all([
    buscarCaptacoesPendentes(organizationId, { limite: 50 }),
    contarCaptacoesPendentes(organizationId),
  ]);

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="min-w-0 break-words text-2xl font-semibold">Contatos a identificar</h1>
        <p className="text-sm text-muted-foreground">
          Contatos recebidos pelo site que o sistema guardou sem decidir a quem pertencem.
        </p>
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum contato aguardando identificação.
        </p>
      ) : (
        <CaptacoesPendentes captacoes={captacoes} total={total} fuso={fuso} />
      )}
    </div>
  );
}
