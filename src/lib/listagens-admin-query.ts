// Construção do `where` das listagens administrativas, extraída dos
// page.tsx pra ser testável sem precisar de um banco real — o ponto
// central de verificação é que `organizationId` está sempre presente e
// nunca é sobrescrito por filtro/busca do usuário (isolamento de tenant).
import type { Prisma, PersonRole } from "@/generated/prisma/client";
import { normalizarTelefone } from "@/lib/telefone";

export function construirWhereImoveis(params: {
  organizationId: string;
  busca: string;
  statusFiltro?: string;
  tipoFiltro?: string;
  finalidadeFiltro?: string;
  // Logs de Auditoria, Etapa 4 — default false: a listagem operacional
  // padrão NUNCA mostra um imóvel arquivado, a menos que o usuário peça
  // explicitamente (tela "Arquivados"). Mesma doutrina de "dúvida = não
  // mostra" usada em outras exclusões por padrão deste projeto.
  incluirArquivados?: boolean;
}): Prisma.PropertyWhereInput {
  const { organizationId, busca, statusFiltro, tipoFiltro, finalidadeFiltro, incluirArquivados } = params;
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
    ...(incluirArquivados ? {} : { archivedAt: null }),
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
  // Fase 22 — fragmento de escopo comercial (wherePessoa). `{}` no modo
  // colaborativo e para a camada gerencial, e nesse caso o `where`
  // resultante é idêntico ao que sempre foi.
  //
  // Entra via `AND` explícito, nunca por spread: o fragmento tem o seu
  // próprio `OR` (pessoa com negociação minha OU registro que criei sem
  // negociação) e este objeto já usa `OR` para a busca — fundir os dois
  // no mesmo nível faria um sobrescrever o outro e ABRIR o filtro.
  escopo?: Prisma.PersonWhereInput;
  // Logs de Auditoria, Etapa 4 — mesma doutrina de construirWhereImoveis:
  // cliente arquivado nunca aparece na listagem padrão, a menos que
  // pedido explicitamente.
  incluirArquivados?: boolean;
}): Prisma.PersonWhereInput {
  const { organizationId, busca, estagioFiltro, origemFiltro, papelFiltro, escopo, incluirArquivados } = params;
  const temEscopo = escopo && Object.keys(escopo).length > 0;
  // Fase 129 — achado real: `phone` é gravado EXATAMENTE como o único
  // campo de telefone do produto grava (CampoTelefone, mascarado ao
  // vivo: "(11) 99999-8888"), nunca em dígitos crus. `contains` direto
  // em `phone` não acha esse registro buscando só os dígitos — o jeito
  // mais natural de colar um número de outro sistema/discador. A ponte
  // é `phoneNormalized`, que já existe e já é mantido só para dedup
  // (person-dedup.ts) — reaproveitado aqui, nenhuma coluna nova. Só
  // entra quando a busca tem algum dígito; "ana" não ganha uma cláusula
  // phoneNormalized vazia correspondendo a tudo.
  const digitosBusca = normalizarTelefone(busca);

  return {
    ...(temEscopo ? { AND: [escopo] } : {}),
    organizationId,
    ...(incluirArquivados ? {} : { archivedAt: null }),
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
            ...(digitosBusca ? [{ phoneNormalized: { contains: digitosBusca } }] : []),
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

// Logs de Auditoria (Etapa 2) — mesmo racional: organizationId SEMPRE no
// topo, nunca condicionado a nenhum filtro recebido do cliente. userId,
// entity e action vêm de dropdowns alimentados por valores já existentes
// no próprio banco (ver page.tsx) — nunca texto livre encaminhado direto
// ao Prisma. "de"/"ate" são datas (YYYY-MM-DD do <input type="date">);
// uma string inválida ou vazia é ignorada, nunca vira um filtro quebrado
// ou um throw — uma tela de auditoria não deveria cair por causa de um
// parâmetro de data malformado na URL.
function dataValida(valor: string | undefined): Date | undefined {
  if (!valor) return undefined;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? undefined : data;
}

export function construirWhereAuditoria(params: {
  organizationId: string;
  userIdFiltro?: string;
  entityFiltro?: string;
  actionFiltro?: string;
  de?: string;
  ate?: string;
}): Prisma.ActivityLogWhereInput {
  const { organizationId, userIdFiltro, entityFiltro, actionFiltro, de, ate } = params;

  const inicio = dataValida(de);
  // "ate" é o FIM do dia escolhido, não a meia-noite dele — sem isso,
  // filtrar "até hoje" excluiria tudo que aconteceu hoje depois das 00h00.
  const fimBruto = dataValida(ate);
  const fim = fimBruto ? new Date(fimBruto.getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;

  return {
    organizationId,
    ...(userIdFiltro ? { userId: userIdFiltro } : {}),
    ...(entityFiltro ? { entity: entityFiltro } : {}),
    ...(actionFiltro ? { action: actionFiltro } : {}),
    ...(inicio || fim
      ? {
          createdAt: {
            ...(inicio ? { gte: inicio } : {}),
            ...(fim ? { lte: fim } : {}),
          },
        }
      : {}),
  };
}
