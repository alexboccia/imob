"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ID_CONFIGURACAO_CONTATO } from "@/lib/configuracao-contato";

function valorOuNulo(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

export async function salvarConfiguracaoContato(formData: FormData) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const dados = {
    telefone: valorOuNulo(formData, "telefone"),
    email: valorOuNulo(formData, "email"),
    whatsapp: valorOuNulo(formData, "whatsapp"),
    instagram: valorOuNulo(formData, "instagram"),
    facebook: valorOuNulo(formData, "facebook"),
    youtube: valorOuNulo(formData, "youtube"),
    linkedin: valorOuNulo(formData, "linkedin"),
    codigoImovelPrefixo: valorOuNulo(formData, "codigoImovelPrefixo")?.toUpperCase() ?? null,
  };

  await prisma.configuracaoContato.upsert({
    where: { id: ID_CONFIGURACAO_CONTATO },
    update: dados,
    create: { id: ID_CONFIGURACAO_CONTATO, ...dados },
  });

  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin/imoveis");
  revalidatePath("/", "layout");
}
