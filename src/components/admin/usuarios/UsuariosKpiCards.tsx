import { Card, CardContent } from "@/components/ui/card";
import { Users, ShieldCheck, Building2, UserCheck } from "lucide-react";

// Redesenho de Usuários — puramente apresentacional, os 4 números já vêm
// calculados em page.tsx (4 counts batched num único Promise.all, mesmo
// padrão de ClientesKpiCards/AgendaKpiCards — nenhuma query neste
// componente). Server Component, sem interatividade.
//
// Divergência deliberada da proposta original ("Total/Proprietários/
// Corretores/Ativos"): "Proprietários" foi trocado por "Administradores"
// (OWNER + ADMIN, o conjunto real de PAPEIS_GESTAO_USUARIOS em
// src/lib/authorization.ts). Papel OWNER é, por regra de negócio, sempre
// exatamente 1 por organização — um card de KPI pra um número que nunca
// varia não comunica nada de operacionalmente útil. "Administradores"
// mede exatamente o grupo cuja contagem mínima é ativamente protegida
// pelas Server Actions (garantirNaoUltimoAdminAtivo), tornando o KPI
// diretamente relevante à regra real do domínio. Ver relatório final.
export function UsuariosKpiCards({
  total,
  administradores,
  corretores,
  ativos,
}: {
  total: number;
  administradores: number;
  corretores: number;
  ativos: number;
}) {
  const cards = [
    {
      icone: Users,
      corIcone: "bg-primary/10 text-primary",
      titulo: "Total de usuários",
      valor: total,
      legenda: total === 1 ? "1 pessoa com acesso" : `${total} pessoas com acesso`,
    },
    {
      icone: ShieldCheck,
      corIcone: "bg-blue-100 text-blue-700",
      titulo: "Administradores",
      valor: administradores,
      legenda: "Proprietário + administradores",
    },
    {
      icone: Building2,
      corIcone: "bg-violet-100 text-violet-700",
      titulo: "Corretores",
      valor: corretores,
      legenda: "Papel Corretor",
    },
    {
      icone: UserCheck,
      corIcone: "bg-success-muted text-success-muted-foreground",
      titulo: "Ativos",
      valor: ativos,
      legenda: total > 0 ? `${ativos} de ${total} usuários` : "Nenhum usuário ainda",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.titulo} size="sm" className="min-w-0">
          <CardContent className="flex items-start gap-3">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${card.corIcone}`}>
              <card.icone className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{card.titulo}</p>
              <p className="text-2xl font-semibold leading-tight">{card.valor}</p>
              <p className="text-xs text-muted-foreground truncate">{card.legenda}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
