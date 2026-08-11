import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { LeadSource, PersonRole } from "@/generated/prisma/client";
import { normalizarEmail } from "@/lib/rate-limit";
import { normalizarTelefone } from "@/lib/telefone";
import { logger } from "@/lib/logger";

// Deduplicação de leads públicos (Fase B do CRM). Regra: dentro da MESMA
// organizationId, mesmo e-mail normalizado OU mesmo telefone normalizado
// reutiliza a Person existente; sem match cria uma nova; match
// conflitante (e-mail bate numa Person, telefone bate em outra Person
// DIFERENTE) nunca mescla, nunca escolhe uma das duas, nunca cria uma
// terceira — só reporta o conflito pro chamador decidir o que fazer (ver
// enviarContato/enviarAnuncioProprietario em src/app/[orgSlug]/actions.ts).
//
// organizationId sempre explícito em toda query — nunca deduplicar entre
// organizações.
export type ResultadoResolucaoPessoa =
  | { tipo: "reutilizada"; personId: string }
  | { tipo: "criada"; personId: string }
  | { tipo: "conflito" };

async function buscarCandidatos(
  organizationId: string,
  emailNormalized: string | null,
  phoneNormalized: string | null
): Promise<string[]> {
  const candidatos: { id: string }[] = [];

  if (emailNormalized) {
    const porEmail = await prisma.person.findFirst({
      where: { organizationId, emailNormalized },
      select: { id: true },
    });
    if (porEmail) candidatos.push(porEmail);
  }

  if (phoneNormalized) {
    const porTelefone = await prisma.person.findFirst({
      where: { organizationId, phoneNormalized },
      select: { id: true },
    });
    if (porTelefone) candidatos.push(porTelefone);
  }

  return [...new Set(candidatos.map((c) => c.id))];
}

// Adiciona um role sem duplicar entrada no array e sem race condition:
// updateMany com NOT roles.has(role) é uma única instrução SQL — sob
// concorrência, a segunda execução na mesma linha só roda depois da
// primeira commitar (lock de linha do Postgres) e nesse momento sua
// própria condição WHERE já reavalia contra o dado atualizado, então não
// casa nenhuma linha e vira no-op. Sem $queryRaw.
async function adicionarRoleSeAusente(
  personId: string,
  organizationId: string,
  role: PersonRole
): Promise<void> {
  await prisma.person.updateMany({
    where: { id: personId, organizationId, NOT: { roles: { has: role } } },
    data: { roles: { push: role } },
  });
}

function registrarResultado(
  organizationId: string,
  resultado: ResultadoResolucaoPessoa
): void {
  // Log técnico sem PII — nunca nome/e-mail/telefone/mensagem/IDs de
  // outras Person envolvidas num conflito.
  logger.info("dedup_lead", {
    organizationId,
    modulo: "crm-dedup",
    reused: resultado.tipo === "reutilizada",
    conflict: resultado.tipo === "conflito",
  });
}

export async function resolverPessoaParaFormularioPublico(params: {
  organizationId: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  role: PersonRole;
  source?: LeadSource;
  notesNaCriacao?: string | null;
}): Promise<ResultadoResolucaoPessoa> {
  const { organizationId, nome, email, telefone, role, source, notesNaCriacao } = params;
  const emailNormalized = email ? normalizarEmail(email) : null;
  const phoneNormalized = telefone ? normalizarTelefone(telefone) : null;

  const idsDistintos = await buscarCandidatos(organizationId, emailNormalized, phoneNormalized);

  if (idsDistintos.length > 1) {
    // Conflito: e-mail e telefone apontam pra Person diferentes. Nunca
    // mesclar, nunca escolher uma, nunca criar uma terceira Person (ela
    // teria emailNormalized/phoneNormalized forçosamente nulos — mesmos
    // valores já pertencem às duas Person existentes — e ficaria
    // igualmente não-deduplicável, proliferando Person a cada novo
    // conflito). Decisão de produto: não criar nada, só logar.
    const resultado: ResultadoResolucaoPessoa = { tipo: "conflito" };
    registrarResultado(organizationId, resultado);
    return resultado;
  }

  if (idsDistintos.length === 1) {
    const personId = idsDistintos[0];
    await adicionarRoleSeAusente(personId, organizationId, role);
    const resultado: ResultadoResolucaoPessoa = { tipo: "reutilizada", personId };
    registrarResultado(organizationId, resultado);
    return resultado;
  }

  // Nenhum match — tenta criar. Corrida possível: outra requisição
  // idêntica pode ter criado a Person entre a busca acima e este create.
  try {
    const pessoa = await prisma.person.create({
      data: {
        organizationId,
        name: nome,
        email: email || null,
        phone: telefone || null,
        emailNormalized,
        phoneNormalized,
        roles: [role],
        source: source ?? null,
        notes: notesNaCriacao || null,
      },
    });
    const resultado: ResultadoResolucaoPessoa = { tipo: "criada", personId: pessoa.id };
    registrarResultado(organizationId, resultado);
    return resultado;
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      const idsAposCorrida = await buscarCandidatos(organizationId, emailNormalized, phoneNormalized);

      if (idsAposCorrida.length > 1) {
        const resultado: ResultadoResolucaoPessoa = { tipo: "conflito" };
        registrarResultado(organizationId, resultado);
        return resultado;
      }

      if (idsAposCorrida.length === 1) {
        const personId = idsAposCorrida[0];
        await adicionarRoleSeAusente(personId, organizationId, role);
        const resultado: ResultadoResolucaoPessoa = { tipo: "reutilizada", personId };
        registrarResultado(organizationId, resultado);
        return resultado;
      }
    }
    throw erro;
  }
}
