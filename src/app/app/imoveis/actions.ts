"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { interpretarPosicao } from "@/lib/vitrine-home";
import { withOrganization } from "@/lib/tenant-context";
import { verificarLimiteImoveis, verificarLimiteFotos, LimiteDoPlanoError } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity-log";
import { type ActionState, erroGenerico } from "@/lib/action-result";
import {
  parseImovelFormData,
  parseMidias,
  camposImovel,
  midiasParaCriar,
} from "@/lib/property-mapper";
import { tagFacetas } from "@/lib/cache-tags";
import { interpretarVinculoEmpreendimento } from "@/lib/empreendimento";
import {
  interpretarLocaisProximos,
  colunasDoLocal,
  type LocalProximo,
} from "@/lib/locais-proximos";
import { empreendimentoDaOrganizacao } from "@/lib/empreendimento-consultas";
import { parseMateriais } from "@/lib/materiais-imovel";

// SEM STORAGE CONFIGURADO, MATERIAL NÃO SE MEXE.
//
// A URL de cada material só pode ser conferida contra a base pública do
// bucket (R2_PUBLIC_URL) — sem ela, toda URL é inválida e a lista
// validada sairia vazia. Gravar esse vazio APAGARIA em silêncio os
// materiais já cadastrados só porque falta uma variável de ambiente, que
// é o pior desfecho possível: perda de dado por configuração. Então,
// quando não há base, o cadastro do imóvel simplesmente não toca nos
// materiais — nem cria, nem apaga.
function storageConfigurado(): boolean {
  return Boolean(process.env.R2_PUBLIC_URL);
}

function materiaisDoFormulario(
  json: string | undefined,
  organizationId: string
): ReturnType<typeof parseMateriais> {
  if (!storageConfigurado()) return [];
  return parseMateriais(json, { organizationId });
}

// Fase 38 — resolve a que empreendimento esta unidade pertence.
//
// O formulário manda um ID, nunca um nome: identidade estrutural, não
// string livre. E o ID é input do navegador como qualquer outro, então
// ele é confirmado CONTRA A ORGANIZAÇÃO antes de virar vínculo — um id
// de outro tenant é recusado, nunca gravado.
//
// null = sem empreendimento, um destino legítimo (inclusive para
// DESVINCULAR uma unidade que já tinha).
// Fase 42 — a coleção de locais próximos, validada antes de qualquer
// escrita. Inválida = nada é gravado e o erro aparece na seção.
function resolverLocaisProximos(
  json: string | undefined
): { ok: true; locais: LocalProximo[] } | { ok: false; estado: ActionState } {
  const r = interpretarLocaisProximos(json);
  if (!r.ok) {
    return {
      ok: false,
      estado: {
        success: false,
        message: "Verifique os campos destacados.",
        fieldErrors: { locaisProximos: [r.erro] },
      },
    };
  }
  return { ok: true, locais: r.locais };
}

async function resolverEmpreendimento(
  organizationId: string,
  bruto: unknown
): Promise<{ ok: true; developmentId: string | null } | { ok: false; estado: ActionState }> {
  const developmentId = interpretarVinculoEmpreendimento(bruto);
  if (developmentId === null) return { ok: true, developmentId: null };

  if (!(await empreendimentoDaOrganizacao(organizationId, developmentId))) {
    return {
      ok: false,
      estado: erroGenerico("Empreendimento não encontrado nesta organização."),
    };
  }
  return { ok: true, developmentId };
}

export async function criarImovel(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const resultado = parseImovelFormData(formData);
  if (!resultado.ok) return resultado.estado;
  const { dados } = resultado;
  const midias = parseMidias(dados.midiasJson);

  const organizationId = await requireOrganizationId();
  try {
    await verificarLimiteImoveis(organizationId);
    // Fase P.9: validado ANTES da transação de criação — a lista de
    // mídias já é a submissão completa (nunca incremental), então checar
    // o tamanho aqui é suficiente, sem depender de count-then-create.
    await verificarLimiteFotos(organizationId, midias.length);
  } catch (erro) {
    if (erro instanceof LimiteDoPlanoError) return erroGenerico(erro.message);
    throw erro;
  }

  const destaque = await resolverPosicaoDestaque(organizationId, null, formData);
  if (!destaque.ok) return destaque.estado;

  const empreendimento = await resolverEmpreendimento(organizationId, dados.empreendimentoId);
  if (!empreendimento.ok) return empreendimento.estado;

  const locais = resolverLocaisProximos(dados.locaisProximosJson);
  if (!locais.ok) return locais.estado;

  let imovel: { id: string; title: string };
  try {
    imovel = await withOrganization(organizationId, () =>
      prisma.property.create({
      data: {
        organizationId,
        ...camposImovel(dados),
        developmentId: empreendimento.developmentId,
        homeHighlightPosition: destaque.posicao,
        // Só definido na criação: quem cadastra o imóvel vira o
        // responsável inicial. A edição não tem campo de UI para
        // reatribuir responsável, então não mexe nesse valor.
        responsibleMemberId: session.user.organizationMemberId ?? null,
        publishedAt: dados.status === "AVAILABLE" ? new Date() : null,
        media: { create: midiasParaCriar(midias, organizationId) },
        ...(storageConfigurado()
          ? {
              presentationMaterials: {
                create: materiaisDoFormulario(dados.materiaisJson, organizationId).map(
                  (material) => ({ ...material, organizationId })
                ),
              },
            }
          : {}),
        // Fase 42 — na criação não há identidade a preservar: tudo é novo.
        nearbyPlaces: {
          create: locais.locais.map((local, ordem) => ({
            ...colunasDoLocal(local, ordem),
            organizationId,
          })),
        },
        statusHistory: {
          create: { previousStatus: null, newStatus: dados.status, organizationId },
        },
      },
      select: { id: true, title: true },
      })
    );
  } catch (erro) {
    if (ehColisaoDeDestaque(erro)) {
      return erroGenerico(
        "Outra pessoa acabou de usar essa posição na página inicial. Recarregue e escolha outra."
      );
    }
    throw erro;
  }

  await logActivity({
    organizationId,
    userId: session.user.id,
    entity: "Property",
    entityId: imovel.id,
    action: "created",
    payload: { title: imovel.title },
  });

  revalidatePath("/app/imoveis");
  updateTag(tagFacetas(organizationId));
  // Redundância deliberada — mesma razão documentada em
  // configuracoes/actions.ts: não consegui confirmar ao vivo que
  // updateTag() dentro do callback aninhado invalida de fato a página
  // pública.
  revalidatePath("/imoveis");
  revalidatePath("/");
  redirect(`/app/imoveis/${imovel.id}?salvo=1`);
}

// Aplica a escolha de vitrine junto do resto da edição. Devolve uma
// mensagem factual quando a posição pedida já é de outro imóvel — nunca
// remove o ocupante em silêncio, porque isso apagaria uma decisão
// editorial que alguém tomou sem avisar quem tomou.
async function resolverPosicaoDestaque(
  organizationId: string,
  imovelId: string | null,
  formData: FormData
): Promise<{ ok: true; posicao: number | null } | { ok: false; estado: ActionState }> {
  const interpretado = interpretarPosicao(formData.get("posicaoDestaqueHome"));
  if (!interpretado.valido) {
    return { ok: false, estado: erroGenerico("Posição de destaque inválida.") };
  }
  if (interpretado.posicao === null) return { ok: true, posicao: null };

  // Checagem para dar MENSAGEM boa. A garantia de verdade é o índice
  // único (organizationId, homeHighlightPosition) — ver o catch de
  // P2002 abaixo, que é quem decide sob concorrência.
  const ocupante = await prisma.property.findFirst({
    where: {
      organizationId,
      homeHighlightPosition: interpretado.posicao,
      ...(imovelId ? { id: { not: imovelId } } : {}),
    },
    select: { title: true },
  });
  if (ocupante) {
    return {
      ok: false,
      estado: erroGenerico(
        `A posição ${interpretado.posicao} da página inicial já é do imóvel "${ocupante.title}". Escolha outra posição ou remova o destaque daquele imóvel.`
      ),
    };
  }
  return { ok: true, posicao: interpretado.posicao };
}

// A vitrine tem no máximo quatro posições e o banco garante isso com um
// índice único. Uma corrida por posição chega aqui como P2002 — o
// segundo a gravar perde, e recebe uma mensagem que explica o que
// aconteceu em vez de um erro técnico.
function ehColisaoDeDestaque(erro: unknown): boolean {
  return (
    typeof erro === "object" &&
    erro !== null &&
    "code" in erro &&
    (erro as { code?: string }).code === "P2002"
  );
}

export async function atualizarImovel(
  imovelId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const resultado = parseImovelFormData(formData);
  if (!resultado.ok) return resultado.estado;
  const { dados } = resultado;
  const midias = parseMidias(dados.midiasJson);

  const organizationId = await requireOrganizationId();
  try {
    await verificarLimiteFotos(organizationId, midias.length);
  } catch (erro) {
    if (erro instanceof LimiteDoPlanoError) return erroGenerico(erro.message);
    throw erro;
  }

  const destaque = await resolverPosicaoDestaque(organizationId, imovelId, formData);
  if (!destaque.ok) return destaque.estado;

  const empreendimento = await resolverEmpreendimento(organizationId, dados.empreendimentoId);
  if (!empreendimento.ok) return empreendimento.estado;

  const locais = resolverLocaisProximos(dados.locaisProximosJson);
  if (!locais.ok) return locais.estado;

  try {
  await withOrganization(organizationId, async () => {
    const imovelAtual = await prisma.property.findUniqueOrThrow({
      where: { id: imovelId, organizationId },
      select: { status: true, publishedAt: true },
    });

    const statusMudou = imovelAtual.status !== dados.status;

    // Fase 42 — LOCAIS PRÓXIMOS: sincronização, não apagar-e-recriar.
    //
    // Diferente de mídias e materiais, cada local mantém a sua identidade
    // entre edições: editar a distância de "Parque Ibirapuera" atualiza
    // AQUELA linha, e apagar só a distância nunca remove o local.
    //
    // Um id vindo do formulário só é tratado como "o mesmo local" se
    // pertencer a ESTE imóvel nesta organização — conferido aqui, contra
    // o banco. Qualquer outro id (de outro imóvel, de outro tenant,
    // inventado) é ignorado e o item vira um local NOVO deste imóvel: os
    // dados são do próprio corretor, mas a linha alheia nunca é tocada.
    const idsExistentes = new Set(
      (
        await prisma.nearbyPlace.findMany({
          where: { propertyId: imovelId, organizationId },
          select: { id: true },
        })
      ).map((l) => l.id)
    );
    const listaLocais = locais.locais;
    const mantidos = listaLocais
      .map((local, ordem) => ({ local, ordem }))
      .filter(({ local }) => local.id !== undefined && idsExistentes.has(local.id));
    const novos = listaLocais
      .map((local, ordem) => ({ local, ordem }))
      .filter(({ local }) => local.id === undefined || !idsExistentes.has(local.id));
    const idsMantidos = mantidos.map(({ local }) => local.id as string);

    // Materiais seguem o mesmo contrato das mídias: a submissão é sempre
    // a lista COMPLETA, então apagar e recriar dentro da mesma transação
    // é o que mantém banco e formulário idênticos. Remover um material
    // aqui não apaga o objeto no R2 — exatamente como já acontece com
    // foto removida (ver comentário do MediaUploader).
    await prisma.$transaction([
      // Sai o que o corretor removeu da lista — e só isso.
      prisma.nearbyPlace.deleteMany({
        where: { propertyId: imovelId, organizationId, id: { notIn: idsMantidos } },
      }),
      // updateMany com propertyId + organizationId no WHERE: mesmo que a
      // conferência acima falhasse, nenhuma linha de outro imóvel casaria.
      ...mantidos.map(({ local, ordem }) =>
        prisma.nearbyPlace.updateMany({
          where: { id: local.id, propertyId: imovelId, organizationId },
          data: colunasDoLocal(local, ordem),
        })
      ),
      ...(novos.length > 0
        ? [
            prisma.nearbyPlace.createMany({
              data: novos.map(({ local, ordem }) => ({
                ...colunasDoLocal(local, ordem),
                propertyId: imovelId,
                organizationId,
              })),
            }),
          ]
        : []),
      prisma.media.deleteMany({ where: { propertyId: imovelId, organizationId } }),
      ...(storageConfigurado()
        ? [
            prisma.propertyPresentationMaterial.deleteMany({
              where: { propertyId: imovelId, organizationId },
            }),
          ]
        : []),
      prisma.property.update({
        where: { id: imovelId, organizationId },
        data: {
          ...camposImovel(dados),
          // Vínculo SEMPRE reescrito na edição (inclusive para null):
          // é o que permite desvincular uma unidade pelo próprio
          // formulário, sem uma segunda ação.
          developmentId: empreendimento.developmentId,
          homeHighlightPosition: destaque.posicao,
          publishedAt:
            dados.status === "AVAILABLE" && !imovelAtual.publishedAt
              ? new Date()
              : undefined,
          media: { create: midiasParaCriar(midias, organizationId) },
          ...(storageConfigurado()
            ? {
                presentationMaterials: {
                  create: materiaisDoFormulario(dados.materiaisJson, organizationId).map(
                    (material) => ({ ...material, organizationId })
                  ),
                },
              }
            : {}),
          ...(statusMudou
            ? {
                statusHistory: {
                  create: {
                    previousStatus: imovelAtual.status,
                    newStatus: dados.status,
                    organizationId,
                  },
                },
              }
            : {}),
        },
      }),
    ]);
  });
  } catch (erro) {
    if (ehColisaoDeDestaque(erro)) {
      return erroGenerico(
        "Outra pessoa acabou de usar essa posição na página inicial. Recarregue e escolha outra."
      );
    }
    throw erro;
  }

  await logActivity({
    organizationId,
    userId: session.user.id,
    entity: "Property",
    entityId: imovelId,
    action: "updated",
  });

  revalidatePath("/app/imoveis");
  revalidatePath(`/app/imoveis/${imovelId}`);
  revalidatePath(`/imoveis/${imovelId}`);
  updateTag(tagFacetas(organizationId));
  // Redundância deliberada — ver nota em criarImovel acima.
  revalidatePath("/imoveis");
  revalidatePath("/");
  redirect(`/app/imoveis/${imovelId}?salvo=1`);
}
