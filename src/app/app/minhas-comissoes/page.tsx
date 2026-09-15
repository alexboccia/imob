import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { hasModule } from "@/lib/entitlements";
import { buscarFusoOrganizacao } from "@/lib/fuso-organizacao";
import { buscarComissaoAReceber } from "@/lib/comissao-a-receber";
import { ComissaoAReceber } from "@/components/admin/ComissaoAReceber";

export const metadata = { title: "Minhas comissões" };

// Minhas comissões (Fase 35).
//
// -----------------------------------------------------------------------
// POR QUE UMA TELA PRÓPRIA, depois de auditar as existentes
// -----------------------------------------------------------------------
// A pergunta desta fase — "somando tudo, quanto ainda tenho a receber" —
// é PESSOAL e é um SALDO. Nenhuma superfície existente pode hospedá-la
// sem quebrar o próprio contrato:
//
//   /app/clientes/[id]  já mostra atribuído/pago/pendente por parcela
//                       (DivisaoComissao), mas é por CLIENTE: não existe
//                       lugar ali para somar negócios de pessoas diferentes.
//   /app/analytics      é inteiramente recortado por período, e o domínio
//                       já recusou explicitamente colocar saldo ali —
//                       saldo é estoque, e um estoque filtrado por 30 dias
//                       mistura duas naturezas (ver pagamento-comissao.ts).
//                       Além disso, a visão "Minha carteira" só existe em
//                       política RESTRICTED: num tenant colaborativo o
//                       corretor nunca a alcança.
//   /app (Central)      é o que exige AÇÃO COMERCIAL agora. Saldo a
//                       receber não é tarefa, e transformar a Central em
//                       painel financeiro tiraria o foco dela.
//
// Então a tela é nova, mas o DADO não é: tudo aqui vem de
// buscarComissaoAReceber, que reusa resumirLiquidacao — a mesma função
// que a ficha do cliente já usa. Os mesmos fatos produzem os mesmos
// números nos dois lugares porque é literalmente o mesmo cálculo.
//
// -----------------------------------------------------------------------
// AUTORIZAÇÃO
// -----------------------------------------------------------------------
// Nenhum papel novo. O portão é o do CRM (igual a Clientes, Pipeline,
// Agenda e Analytics) mais a existência de um vínculo de membro — sem
// vínculo não existe "minha participação" que se possa afirmar.
//
// NÃO é PAPEIS_LIQUIDACAO_COMISSAO: aquele conjunto governa REGISTRAR e
// CANCELAR pagamento, e continua intocado na ficha do cliente. Ler o
// próprio saldo não é operar a liquidação — exigir papel gerencial para
// alguém ver quanto tem a receber seria negar a pergunta a quem ela
// pertence.
//
// NENHUMA PERMISSÃO É AMPLIADA: a consulta filtra por memberId DA SESSÃO,
// então qualquer papel (inclusive ASSISTANT) vê exclusivamente as
// próprias participações — nunca as de um colega. Não há visão de equipe
// aqui, nem para OWNER/ADMIN/MANAGER: o agregado da equipe já existe no
// Analytics organizacional e esta fase não constrói painel gerencial.
export default async function MinhasComissoesPage() {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) redirect("/app");

  // Sem vínculo de membro não há carteira. Falha FECHADA: redireciona em
  // vez de cair num predicado vazio que poderia somar a organização toda.
  const memberId = session.user.organizationMemberId ?? null;
  if (!memberId) redirect("/app");

  const [fuso, carteira] = await Promise.all([
    buscarFusoOrganizacao(organizationId),
    buscarComissaoAReceber(organizationId, memberId),
  ]);

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="min-w-0 break-words text-2xl font-semibold">Minhas comissões</h1>
        <p className="text-sm text-muted-foreground">
          Quanto da comissão é seu, quanto já foi pago e quanto ainda falta receber.
        </p>
      </div>

      <ComissaoAReceber carteira={carteira} fuso={fuso} />
    </div>
  );
}
