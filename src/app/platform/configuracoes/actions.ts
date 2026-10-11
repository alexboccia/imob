"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { PAPEIS_PLATAFORMA_TUDO, temPapelPlataforma } from "@/lib/platform/authorization";
import { logPlatformActivity } from "@/lib/platform/audit";
import { normalizarTelefoneSuporte } from "@/lib/plataforma-suporte";
import { type ActionState, erroAcessoNegado, erroValidacao, sucesso } from "@/lib/action-result";

// SUP-001 (Fase 112) — telefone/horário do suporte oficial do SaaS.
// Mesmo padrão de autorização de criarPlatformOperator: só quem tem
// PAPEIS_PLATAFORMA_TUDO (hoje, só SUPER_ADMIN) edita. requirePlatformOperator()
// já revalida sessão + active no servidor — nunca confia em controle
// visual.
const configuracaoSuporteSchema = z.object({
  telefone: z
    .string()
    .min(1, "Informe o telefone.")
    .refine((v) => normalizarTelefoneSuporte(v) !== null, {
      message: "Telefone inválido. Use DDD + número, com ou sem DDI (ex: 11976069213).",
    }),
  horario: z
    .string()
    .trim()
    .max(200, "Use um texto mais curto.")
    .optional()
    .or(z.literal("")),
});

export async function salvarConfiguracaoSuporte(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const operador = await requirePlatformOperator();
  if (!temPapelPlataforma(operador.role, PAPEIS_PLATAFORMA_TUDO)) {
    return erroAcessoNegado();
  }

  const parsed = configuracaoSuporteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);

  const telefoneDigitos = normalizarTelefoneSuporte(parsed.data.telefone)!;
  const horario = parsed.data.horario || null;

  await prisma.platformSettings.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      supportPhone: telefoneDigitos,
      supportHours: horario,
      updatedByOperatorId: operador.id,
    },
    update: {
      supportPhone: telefoneDigitos,
      supportHours: horario,
      updatedByOperatorId: operador.id,
    },
  });

  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "PLATFORM_SUPPORT_SETTINGS_UPDATED",
    entity: "PlatformSettings",
    entityId: "global",
    // Dígitos de telefone não são segredo (é o número público de
    // suporte) — mas mesmo assim só o essencial, nunca o objeto inteiro.
    metadata: { horarioDefinido: horario !== null },
  });

  revalidatePath("/platform/configuracoes");
  return sucesso("Configuração de suporte salva.");
}
