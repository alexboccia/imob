import { requireOrganizationId } from "@/lib/tenant";
import { temPapel, PAPEIS_GESTAO_CATALOGOS } from "@/lib/authorization";
import { papelAtual } from "@/lib/papel-atual";
import { listarEmpreendimentos } from "@/lib/empreendimento-consultas";
import { EmpreendimentosCard } from "@/components/admin/EmpreendimentosCard";
import { CabecalhoPagina } from "@/components/admin/ui/CabecalhoPagina";

export const metadata = { title: "Empreendimentos" };

// Gestão de empreendimentos (Fase 38; redesenho visual na Fase 71).
//
// AUTORIZAÇÃO, igual às outras telas de catálogo: a LEITURA continua
// acessível a qualquer membro autenticado — um corretor precisa saber
// quais empreendimentos existem para reconhecê-los no cadastro do imóvel
// — e só a UI de criar/renomear/excluir fica condicionada ao mesmo papel
// que as Server Actions já exigem. Esconder um botão é higiene de
// interface; a garantia real está inteira no servidor.
export default async function EmpreendimentosPage() {
  const organizationId = await requireOrganizationId();
  const podeGerenciar = temPapel(await papelAtual(), PAPEIS_GESTAO_CATALOGOS);
  const empreendimentos = await listarEmpreendimentos(organizationId);

  return (
    <div className="space-y-6">
      {/* Fase 71 — cabeçalho migrado para o componente compartilhado.
          Título e descrição PRESERVADOS palavra por palavra: nenhum botão
          foi adicionado aqui — a única ação de criação já mora na seção
          "Novo empreendimento", mais abaixo, e só para quem gerencia. */}
      <CabecalhoPagina
        titulo="Empreendimentos"
        descricao="Agrupe imóveis que são unidades do mesmo empreendimento. O vínculo é declarado no cadastro de cada imóvel — aqui você só diz quais empreendimentos existem."
      />

      <EmpreendimentosCard
        empreendimentos={empreendimentos}
        podeGerenciar={podeGerenciar}
      />
    </div>
  );
}
