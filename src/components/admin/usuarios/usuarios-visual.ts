// Redesenho de Usuários — mapeamentos puramente apresentacionais,
// client-safe por construção (zero import de @/lib/prisma ou de qualquer
// módulo que toque Prisma) — mesmo padrão de agenda-visual.ts/
// prioridade-visual.ts nos redesenhos anteriores.

// Badge de papel — mesmas cores já usadas em columns.tsx antes do
// redesenho, só centralizadas aqui pra serem reaproveitadas também pelos
// KPIs/filtros sem duplicar o mapa em dois arquivos.
export const PAPEL_BADGE_CLASS: Record<string, string> = {
  OWNER: "bg-black text-white",
  ADMIN: "bg-black text-white",
  MANAGER: "bg-blue-600 text-white",
  BROKER: "bg-secondary text-secondary-foreground",
  ASSISTANT: "bg-secondary text-secondary-foreground",
};

// MemberStatus real (prisma/schema.prisma) tem 3 valores — ACTIVE/
// INVITED/SUSPENDED —, mas só ACTIVE/SUSPENDED são alcançáveis pelo fluxo
// real desta tela (criarUsuario sempre cria ACTIVE; INVITED só existe
// durante o bootstrap de uma organização nova pelo Platform Admin, um
// estado transitório de antes do primeiro OWNER completar o cadastro —
// nunca visível aqui, já que logar em /app/usuarios exige uma membership
// ACTIVE). O rótulo "Convite pendente" existe só como fallback correto
// (nunca "Inativo" incorreto) caso esse valor apareça por algum caminho
// não previsto — não é uma capacidade nova oferecida na UI (sem filtro
// nem KPI dedicado a ela, ver UsuariosFiltrosBar/UsuariosKpiCards).
export const STATUS_MEMBRO_LABEL: Record<string, string> = {
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  INVITED: "Convite pendente",
};

export const STATUS_MEMBRO_BADGE_VARIANT: Record<string, "secondary" | "destructive" | "outline"> = {
  ACTIVE: "secondary",
  SUSPENDED: "destructive",
  INVITED: "outline",
};
