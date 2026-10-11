import { prisma } from "@/lib/prisma";

// Leitura do banco para a configuração de suporte do SaaS (Fase 112) —
// separado de plataforma-suporte.ts (funções puras) de propósito: este
// arquivo importa @/lib/prisma e NUNCA deve ser importado por um Client
// Component (ver comentário em plataforma-suporte.ts).

export type ConfiguracaoSuporte = {
  telefoneDigitos: string | null;
  horarioAtendimento: string | null;
  atualizadoEm: Date | null;
};

export async function buscarConfiguracaoSuporte(): Promise<ConfiguracaoSuporte> {
  const config = await prisma.platformSettings.findUnique({
    where: { id: "global" },
    select: { supportPhone: true, supportHours: true, updatedAt: true },
  });
  return {
    telefoneDigitos: config?.supportPhone ?? null,
    horarioAtendimento: config?.supportHours ?? null,
    atualizadoEm: config?.updatedAt ?? null,
  };
}
