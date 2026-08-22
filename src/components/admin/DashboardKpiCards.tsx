import { Card, CardContent } from "@/components/ui/card";
import { Building2, UserPlus, Handshake, Clock } from "lucide-react";
import type { MetricasDashboard } from "@/lib/dashboard";

// Redesenho do Dashboard — mesmo padrão visual de PipelineKpiCards/
// UsuariosKpiCards (ícone colorido + número + legenda). Grid
// `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (não `grid-cols-2` já em
// mobile) DE PROPÓSITO — é o mesmo padrão de PipelineKpiCards, escolhido
// especificamente aqui porque `grid-cols-2` (usado em UsuariosKpiCards/
// ClientesKpiCards) tem um bug pré-existente e documentado: em ~88-118px
// de coluna real (atrás da sidebar fixa, 360-390px de viewport), dividir
// em 2 colunas deixa menos espaço do que a caixa fixa do ícone (36px) +
// gap (12px) consomem, e o título do card colapsa pra 0px de largura
// (achado #4 da auditoria de Usuários, reproduzido idêntico em Clientes —
// não corrigido lá por ser componente compartilhado com blast radius,
// fora de escopo daquela tarefa). Aqui é um componente nôvo e exclusivo
// do Dashboard: nenhum blast radius em escolher o layout mais seguro
// desde o início, sem tocar em nenhum componente compartilhado.
//
// Correção do Finding MEDIUM (auditoria pré-commit) — mesmo com
// grid-cols-1 evitando o colapso a 0px, a coluna real em 360-375px
// (~88-103px) ainda deixa só ~16-31px pro título depois do padding do
// CardContent (px-3 = 24px) + a caixa do ícone (36px) + o gap (12px)
// horizontais — títulos como "Imóveis disponíveis" quebravam caractere a
// caractere. `flex-col` (ícone empilhado ACIMA do texto) só abaixo de
// `sm` — o MESMO breakpoint em que o grid acima já vira 2 colunas — dá ao
// título a largura CHEIA do card (ícone para de disputar espaço
// horizontal com o texto), sem alterar em nada a aparência em sm/lg
// (`sm:flex-row` restaura o layout horizontal original, byte a byte,
// onde já sobra espaço de sobra). `items-stretch` (mobile) faz o bloco de
// texto ocupar a largura inteira do CardContent — a caixa do ícone
// continua exatamente 36×36 porque `size-9` já fixa width/height
// explicitamente (stretch não afeta eixo com tamanho explícito).
// `break-words` no título: mesmo mecanismo já usado no <h1>Dashboard</h1>
// (auditoria anterior) — even a 64-79px, a palavra "disponíveis" sozinha
// ainda é mais larga que a caixa; sem break-words ela vazaria em vez de
// quebrar. O resultado é quebra por PALAVRA (ex.: "Imóveis" / "dispo-"
// "níveis"), nunca mais por caractere solto.
export function DashboardKpiCards({ metricas }: { metricas: MetricasDashboard }) {
  const cards = [
    {
      icone: Building2,
      corIcone: "bg-primary/10 text-primary",
      titulo: "Imóveis disponíveis",
      valor: metricas.imoveisDisponiveis,
      legenda: "disponíveis no portfólio",
    },
    {
      icone: UserPlus,
      corIcone: "bg-blue-100 text-blue-700",
      titulo: "Novos leads",
      valor: metricas.leadsNoMes,
      legenda: "neste mês",
    },
    {
      icone: Handshake,
      corIcone: "bg-success-muted text-success-muted-foreground",
      titulo: "Negócios fechados",
      valor: metricas.negociosFechadosNoMes,
      legenda: "neste mês",
    },
    {
      icone: Clock,
      corIcone: "bg-orange-100 text-orange-700",
      titulo: "Imóveis parados",
      valor: metricas.imoveisParados,
      legenda: "há mais de 90 dias",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.titulo} size="sm" className="min-w-0">
          <CardContent className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${card.corIcone}`}>
              <card.icone className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="min-w-0 break-words text-sm text-muted-foreground">{card.titulo}</p>
              <p className="text-2xl font-semibold leading-tight">{card.valor}</p>
              <p className="text-xs text-muted-foreground truncate">{card.legenda}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
