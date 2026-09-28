import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { hasModule } from "@/lib/entitlements";
import { temPapel, PAPEIS_RESOLUCAO_IDENTIDADE } from "@/lib/authorization";
import { papelAtual } from "@/lib/papel-atual";
import { buscarFusoOrganizacao } from "@/lib/fuso-organizacao";
import {
  buscarCaptacoesPendentes,
  contarCaptacoesPendentes,
} from "@/lib/captacao-pendente";
import { ContatosAIdentificar } from "@/components/admin/ContatosAIdentificar";
import { CabecalhoPagina } from "@/components/admin/ui/CabecalhoPagina";

// Fila de identificação (Fase 24; redesenho visual na Fase 70). A
// autorização é verificada AQUI, no servidor, antes de qualquer consulta
// — e novamente dentro da action. Esconder o item de menu não é controle
// de acesso.
export default async function CaptacoesPage() {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) redirect("/app");
  if (!temPapel(await papelAtual(), PAPEIS_RESOLUCAO_IDENTIDADE)) redirect("/app");

  const fuso = await buscarFusoOrganizacao(organizationId);
  const [captacoes, total] = await Promise.all([
    buscarCaptacoesPendentes(organizationId, { limite: 50 }),
    contarCaptacoesPendentes(organizationId),
  ]);

  return (
    <div className="space-y-6">
      {/* Fase 70 — cabeçalho migrado para o componente compartilhado.
          Título e descrição PRESERVADOS palavra por palavra: nenhum CTA
          global foi adicionado, porque não existe ação de página aqui
          (a única ação real é por contato — ver ContatosAIdentificar). */}
      <CabecalhoPagina
        titulo="Contatos a identificar"
        descricao="Contatos recebidos pelo site que o sistema guardou sem decidir a quem pertencem."
      />

      <ContatosAIdentificar captacoes={captacoes} total={total} fuso={fuso} />
    </div>
  );
}
