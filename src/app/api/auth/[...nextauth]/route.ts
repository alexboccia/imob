import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { obterIpCliente } from "@/lib/client-ip";
import { obterKvStore } from "@/lib/kv-store";
import { verificarBloqueioLogin } from "@/lib/rate-limit";
import { cabecalhosLimiteExcedido } from "@/lib/rate-limit-response";

export const { GET } = handlers;

// O callback de credentials (`/api/auth/callback/credentials`) é o único
// ponto de login por senha do sistema — é onde intercepta-se pra devolver
// um 429 de verdade com Retry-After quando o IP/e-mail já está bloqueado,
// sem gastar bcrypt/consulta ao banco (o `authorize()` em lib/auth.ts só
// registra falhas novas; quem decide se já está bloqueado é aqui). Todo o
// resto (signin/signout/session/csrf) segue pro handler padrão do
// Auth.js, sem checagem — não é superfície de força bruta de senha.
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  if (!url.pathname.endsWith("/callback/credentials")) {
    return handlers.POST(request);
  }

  const store = obterKvStore();
  if (store) {
    const ip = obterIpCliente(request.headers);
    let email: string | null = null;
    try {
      const corpo = await request.clone().formData();
      const valor = corpo.get("email");
      email = typeof valor === "string" ? valor : null;
    } catch {
      // corpo não é form-urlencoded — segue sem e-mail, só a checagem por IP vale.
    }

    const bloqueio = await verificarBloqueioLogin(store, { ip, email });
    if (!bloqueio.permitido) {
      const destino = new URL("/app/login", request.url);
      destino.searchParams.set("error", "RateLimited");
      destino.searchParams.set("code", "too_many_attempts");
      return NextResponse.json(
        { url: destino.toString() },
        { status: 429, headers: cabecalhosLimiteExcedido(bloqueio.retryAfterSegundos) }
      );
    }
  }

  return handlers.POST(request);
}
