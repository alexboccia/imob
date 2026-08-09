"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { PAPEIS_PLATAFORMA_TUDO, temPapelPlataforma } from "@/lib/platform/authorization";
import { logPlatformActivity } from "@/lib/platform/audit";
import { type ActionState, erroAcessoNegado, erroGenerico, erroValidacao, sucesso } from "@/lib/action-result";

const criarOperatorSchema = z.object({
  name: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  senha: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
});

// PlatformOperator é identidade INTERNA da equipe EasyMob (não um cliente)
// — diferente do onboarding do OWNER (Fase 3), aqui o próprio Super Admin
// que está criando já define a senha inicial diretamente, sem precisar
// do fluxo de convite/token (isso é proporcional: convite existe pra não
// expor senha de CLIENTE ao Super Admin, não se aplica à equipe interna
// criando colegas de confiança).
export async function criarPlatformOperator(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const operador = await requirePlatformOperator();
  if (!temPapelPlataforma(operador.role, PAPEIS_PLATAFORMA_TUDO)) {
    return erroAcessoNegado();
  }

  const parsed = criarOperatorSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const dados = parsed.data;

  const existente = await prisma.platformOperator.findUnique({ where: { email: dados.email } });
  if (existente) return erroGenerico("Já existe um operador com esse e-mail.");

  const senhaHash = await bcrypt.hash(dados.senha, 10);

  const novoOperador = await prisma.platformOperator.create({
    data: {
      name: dados.name,
      email: dados.email,
      passwordHash: senhaHash,
      role: "SUPER_ADMIN",
    },
  });

  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: "PLATFORM_OPERATOR_CREATED",
    entity: "PlatformOperator",
    entityId: novoOperador.id,
    metadata: { email: dados.email },
  });

  revalidatePath("/platform/operators");
  return sucesso("Operador criado.");
}

export async function alternarAtivoOperator(operatorId: string): Promise<void> {
  const operador = await requirePlatformOperator();
  if (!temPapelPlataforma(operador.role, PAPEIS_PLATAFORMA_TUDO)) return;

  // Nunca permite desativar a própria conta — evita ficar trancado fora
  // da plataforma sem ninguém pra reverter (decisão explícita, ver
  // critério de aceite da Fase 5 do plano).
  if (operatorId === operador.id) return;

  const alvo = await prisma.platformOperator.findUnique({
    where: { id: operatorId },
    select: { active: true },
  });
  if (!alvo) return;

  await prisma.platformOperator.update({
    where: { id: operatorId },
    data: { active: !alvo.active },
  });

  await logPlatformActivity({
    platformOperatorId: operador.id,
    action: alvo.active ? "PLATFORM_OPERATOR_DEACTIVATED" : "PLATFORM_OPERATOR_ACTIVATED",
    entity: "PlatformOperator",
    entityId: operatorId,
  });

  revalidatePath("/platform/operators");
}
