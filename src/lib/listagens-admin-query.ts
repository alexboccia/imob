// Construção do `where` das listagens administrativas, extraída dos
// page.tsx pra ser testável sem precisar de um banco real — o ponto
// central de verificação é que `organizationId` está sempre presente e
// nunca é sobrescrito por filtro/busca do usuário (isolamento de tenant).
import type { Prisma, PersonRole } from "@/generated/prisma/client";

export function construirWhereImoveis(params: {
  organizationId: string;
  busca: string;
  statusFiltro?: string;
  tipoFiltro?: string;
  finalidadeFiltro?: string;
}): Prisma.PropertyWhereInput {
  const { organizationId, busca, statusFiltro, tipoFiltro, finalidadeFiltro } = params;
  // "".replace(/\D/g,"") -> "" -> Number("") é 0, não NaN — sem o dígitos
  // ? ... : NaN, uma busca só de texto (sem nenhum número) incluiria por
  // engano a cláusula { code: 0 } no OR.
  //
  // Redesenho de Imóveis — achado real ao escrever o teste E2E de
  // ordenação (marcador com Date.now(), 13 dígitos): `code` é Prisma `Int`
  // (Postgres `integer`, máx. 2147483647); uma busca com uma sequência de
  // ~10+ dígitos (CEP colado sem máscara, telefone, o marcador de teste)
  // gerava um `codigoBusca` fora desse range e o Prisma lançava
  // PrismaClientKnownRequestError ("Value out of range for the type") —
  // um HTTP 500 real em /app/imoveis pra uma busca de texto legítima, não
  // hipotética. Corrigido aqui (mesmo arquivo já tocado nesta tarefa) por
  // ser diretamente parte de "busca preservada" (seção 10 do redesenho);
  // fora do escopo do bug ficaria uma regressão funcional não documentada.
  const LIMITE_INT32 = 2147483647;
  const digitosBusca = busca.replace(/\D/g, "");
  const codigoBusca = digitosBusca ? Number(digitosBusca) : NaN;
  const codigoBuscaValido = Number.isInteger(codigoBusca) && codigoBusca >= 0 && codigoBusca <= LIMITE_INT32;

  return {
    organizationId,
    ...(statusFiltro ? { status: statusFiltro as Prisma.PropertyWhereInput["status"] } : {}),
    ...(tipoFiltro ? { type: tipoFiltro } : {}),
    ...(finalidadeFiltro ? { purpose: finalidadeFiltro as Prisma.PropertyWhereInput["purpose"] } : {}),
    ...(busca
      ? {
          OR: [
            { title: { contains: busca, mode: "insensitive" } },
            { city: { contains: busca, mode: "insensitive" } },
            { neighborhood: { contains: busca, mode: "insensitive" } },
            { type: { contains: busca, mode: "insensitive" } },
            ...(codigoBuscaValido ? [{ code: codigoBusca }] : []),
          ],
        }
      : {}),
  };
}

export function construirWhereClientes(params: {
  organizationId: string;
  busca: string;
  estagioFiltro?: string;
  origemFiltro?: string;
  papelFiltro?: string;
}): Prisma.PersonWhereInput {
  const { organizationId, busca, estagioFiltro, origemFiltro, papelFiltro } = params;

  return {
    organizationId,
    ...(estagioFiltro
      ? { pipelineStage: estagioFiltro as Prisma.PersonWhereInput["pipelineStage"] }
      : {}),
    ...(origemFiltro ? { source: origemFiltro as Prisma.PersonWhereInput["source"] } : {}),
    // roles é String[]/PersonRole[] — `has` (não `equals`) porque uma
    // Person pode acumular mais de um papel (ex: LEAD que virou CLIENT
    // sem perder o histórico do primeiro).
    ...(papelFiltro ? { roles: { has: papelFiltro as PersonRole } } : {}),
    ...(busca
      ? {
          OR: [
            { name: { contains: busca, mode: "insensitive" } },
            { email: { contains: busca, mode: "insensitive" } },
            { phone: { contains: busca, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export function construirWhereUsuarios(params: {
  organizationId: string;
  busca: string;
  papelFiltro?: string;
  // Redesenho de Usuários — filtro de status (Ativo/Suspenso) adicionado à
  // barra unificada. O campo já existia e já era exibido (coluna "Status"),
  // só não era filtrável antes. Allowlist validada no caller (page.tsx),
  // mesmo padrão defensivo de papelFiltro — nunca repassa string crua ao
  // Prisma.
  statusFiltro?: string;
}): Prisma.OrganizationMemberWhereInput {
  const { organizationId, busca, papelFiltro, statusFiltro } = params;

  return {
    organizationId,
    ...(papelFiltro ? { role: papelFiltro as Prisma.OrganizationMemberWhereInput["role"] } : {}),
    ...(statusFiltro ? { status: statusFiltro as Prisma.OrganizationMemberWhereInput["status"] } : {}),
    ...(busca
      ? {
          user: {
            OR: [
              { name: { contains: busca, mode: "insensitive" } },
              { email: { contains: busca, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };
}
