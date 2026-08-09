"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/platform/auth";
import { type ActionState, erroGenerico } from "@/lib/action-result";

// signIn() SERVER-SIDE (não next-auth/react) — cada instância de auth é
// uma closure isolada sobre sua própria config, sem o singleton de módulo
// que o client usa pra resolver a rota (__NEXTAUTH.basePath). Ver
// src/lib/platform/auth.ts e o plano, decisão #2.
export async function loginPlatformAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get("email");
  const senha = formData.get("senha");

  try {
    // redirect:false não impede o lançamento de CredentialsSignin em caso
    // de falha (confirmado lendo o código-fonte do next-auth/@auth/core)
    // — só evita que um SUCESSO dispare redirect automático, deixando o
    // redirect explícito abaixo no controle.
    await signIn("credentials", {
      email,
      senha,
      redirect: false,
    });
  } catch (erro) {
    if (erro instanceof AuthError) {
      return erroGenerico(
        "E-mail ou senha inválidos, ou muitas tentativas — aguarde alguns minutos."
      );
    }
    throw erro;
  }

  redirect("/platform");
}
