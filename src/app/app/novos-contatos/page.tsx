import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { hasModule } from "@/lib/entitlements";
import { escopoComercialDaSessao } from "@/lib/escopo-comercial-sessao";
import { temPapel, PAPEIS_DISTRIBUICAO_LEAD } from "@/lib/authorization";
import { papelAtual } from "@/lib/papel-atual";
import { buscarMembrosAtribuiveis } from "@/lib/membros-organizacao";
import { buscarNovosContatos, TETO_VARREDURA } from "@/lib/novos-contatos";
import { TodosNovosContatos } from "@/components/admin/TodosNovosContatos";
import { CabecalhoPagina } from "@/components/admin/ui/CabecalhoPagina";

// Fase 118 — página própria da caixa de entrada comercial, para quem não
// coube no resumo da Home (ver TodosNovosContatos.tsx). Mesmo gate da
// Home: módulo CRM e vínculo com a organização, porque é exatamente o
// que a Home exige para buscar e mostrar este mesmo dado — esconder o
// link não é controle de acesso, a verificação é sempre no servidor.
export default async function NovosContatosPage() {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) redirect("/app");

  const membroId = session.user.organizationMemberId ?? null;
  if (!membroId) redirect("/app");

  const escopo = await escopoComercialDaSessao(organizationId);
  // Mesmo teto de varredura da Home: a página mostra tudo que a consulta
  // alcança, honestamente truncado acima disso — nunca um OFFSET
  // profundo por página.
  const dados = await buscarNovosContatos(organizationId, escopo, {
    limite: TETO_VARREDURA,
  });

  const podeAtribuirContato = temPapel(await papelAtual(), PAPEIS_DISTRIBUICAO_LEAD);
  const membrosParaAtribuir =
    podeAtribuirContato && dados.itens.length > 0
      ? await buscarMembrosAtribuiveis(organizationId)
      : [];

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Novos contatos"
        descricao="Todos os contatos que chegaram pelo site e ainda aguardam atendimento."
      />

      <TodosNovosContatos
        dados={dados}
        meuMemberId={membroId}
        podeAtribuir={podeAtribuirContato}
        membros={membrosParaAtribuir}
      />
    </div>
  );
}
