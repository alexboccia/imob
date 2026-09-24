import { Building2, CheckCircle2, Sparkles, Star } from "lucide-react";
import {
  CartaoEstatistica,
  GradeEstatisticas,
} from "@/components/admin/ui/CartaoEstatistica";

// KPIs do portfólio de imóveis.
//
// Fase 67 — migrados para o cartão compartilhado do backoffice, o mesmo
// do Dashboard e do Pipeline. Puramente apresentacional: os quatro
// números já vêm de `prisma.property.count()` em page.tsx — nenhuma
// consulta nova, nenhum cálculo alterado.
//
// SEM `href`: estes cards não navegam hoje, e dar afordância de clique a
// um card que não é clicável seria prometer uma navegação que não existe.
//
// Ganho colateral da migração: o cartão compartilhado já carrega as
// proteções de coluna estreita (ícone empilhado abaixo de `sm`,
// `break-words` no rótulo) que este componente reproduzia à mão.
export function ImoveisKpiCards({
  total,
  disponiveis,
  oportunidades,
  destaques,
}: {
  total: number;
  disponiveis: number;
  oportunidades: number;
  destaques: number;
}) {
  return (
    <GradeEstatisticas>
      <CartaoEstatistica
        icone={Building2}
        tom="marca"
        rotulo="Total de imóveis"
        valor={total}
        contexto="no portfólio"
      />
      <CartaoEstatistica
        icone={CheckCircle2}
        tom="positivo"
        rotulo="Disponíveis"
        valor={disponiveis}
        // Texto preservado: com zero imóveis, "0 de 0 imóveis" seria pior
        // que dizer que ainda não há nada.
        contexto={total > 0 ? `${disponiveis} de ${total} imóveis` : "Nenhum imóvel ainda"}
      />
      <CartaoEstatistica
        icone={Sparkles}
        tom="info"
        rotulo="Oportunidades"
        valor={oportunidades}
        contexto="marcados como oportunidade"
      />
      <CartaoEstatistica
        icone={Star}
        // Destaque é curadoria, não problema — mas é o tom âmbar que o
        // produto já usava aqui, preservado.
        tom="atencao"
        rotulo="Destaques"
        valor={destaques}
        contexto="marcados como destaque"
      />
    </GradeEstatisticas>
  );
}
