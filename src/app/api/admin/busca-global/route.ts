import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { buscarGlobal } from "@/lib/busca-global";

// Mesmo idioma de src/app/api/admin/bairros/route.ts: auth() explícito
// (nunca confiado ao middleware), requireOrganizationId() resolve o
// tenant da sessão (nunca um organizationId vindo da query string), e
// toda a regra de segurança/normalização/escopo comercial mora em
// buscarGlobal — esta rota só expõe HTTP.
export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const termo = searchParams.get("q") ?? "";

  const organizationId = await requireOrganizationId();
  const resultado = await buscarGlobal(organizationId, termo);
  return NextResponse.json(resultado);
}
