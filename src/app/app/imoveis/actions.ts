"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";

const numeroOpcional = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().optional()
);

const booleanCheckbox = z.preprocess((v) => v === "on", z.boolean());

function parseMesAno(valor: string | undefined): Date | null {
  if (!valor) return null;
  const [ano, mes] = valor.split("-").map(Number);
  if (!ano || !mes) return null;
  return new Date(Date.UTC(ano, mes - 1, 1));
}

const imovelSchema = z.object({
  titulo: z.string().min(3),
  descricao: z.string().optional(),
  tipo: z.string().min(1),
  finalidade: z.enum(["SALE", "RENT", "SALE_AND_RENT"]),
  status: z.enum([
    "DRAFT",
    "AVAILABLE",
    "RESERVED",
    "SOLD",
    "RENTED",
    "INACTIVE",
  ]),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().min(1),
  cidade: z.string().min(1),
  estado: z.string().min(2).max(2),
  latitude: numeroOpcional,
  longitude: numeroOpcional,
  preco: numeroOpcional,
  precoAluguel: numeroOpcional,
  precoCondominio: numeroOpcional,
  precoIptu: numeroOpcional,
  areaTotal: numeroOpcional,
  areaPrivativa: numeroOpcional,
  quartos: numeroOpcional,
  suites: numeroOpcional,
  banheiros: numeroOpcional,
  vagasGaragem: numeroOpcional,
  lancamento: booleanCheckbox,
  destaque: booleanCheckbox,
  oportunidade: booleanCheckbox,
  slideshow: booleanCheckbox,
  estagioObra: z
    .enum(["PRE_CONSTRUCTION", "UNDER_CONSTRUCTION", "READY_TO_MOVE"])
    .optional()
    .or(z.literal("")),
  previsaoEntrega: z.string().optional(),
  construtora: z.string().optional(),
  midiasJson: z.string().optional(),
});

function parseFormData(formData: FormData) {
  const bruto = Object.fromEntries(formData.entries());
  const dados = imovelSchema.parse(bruto);
  return {
    ...dados,
    caracteristicasImovel: formData.getAll("caracteristicasImovel").map(String),
    caracteristicasCondominio: formData
      .getAll("caracteristicasCondominio")
      .map(String),
  };
}

const TIPO_MIDIA_PARA_MEDIA_TYPE = {
  FOTO: "PHOTO",
  VIDEO: "VIDEO",
  PLANTA: "FLOOR_PLAN",
} as const;

function parseMidias(json: string | undefined) {
  if (!json) return [];
  try {
    const midias = JSON.parse(json) as {
      tipo: "FOTO" | "VIDEO" | "PLANTA";
      url: string;
      ehCapa: boolean;
    }[];
    return midias.map((m, i) => ({
      type: TIPO_MIDIA_PARA_MEDIA_TYPE[m.tipo],
      url: m.url,
      isCover: m.ehCapa,
      order: i,
    }));
  } catch {
    return [];
  }
}

export async function criarImovel(formData: FormData) {
  const session = await auth();
  if (!session) redirect("/app/login");

  const dados = parseFormData(formData);
  const midias = parseMidias(dados.midiasJson);

  const organizationId = await requireOrganizationId();
  const imovel = await withOrganization(organizationId, () =>
    prisma.property.create({
      data: {
        organizationId,
        title: dados.titulo,
        description: dados.descricao || null,
        type: dados.tipo,
        purpose: dados.finalidade,
        status: dados.status,
        zipCode: dados.cep || null,
        street: dados.logradouro || null,
        number: dados.numero || null,
        complement: dados.complemento || null,
        neighborhood: dados.bairro,
        city: dados.cidade,
        state: dados.estado.toUpperCase(),
        latitude: dados.latitude ?? null,
        longitude: dados.longitude ?? null,
        price: dados.preco ?? null,
        rentPrice: dados.precoAluguel ?? null,
        condoFee: dados.precoCondominio ?? null,
        propertyTax: dados.precoIptu ?? null,
        totalArea: dados.areaTotal ?? null,
        privateArea: dados.areaPrivativa ?? null,
        bedrooms: dados.quartos ?? null,
        suites: dados.suites ?? null,
        bathrooms: dados.banheiros ?? null,
        parkingSpots: dados.vagasGaragem ?? null,
        propertyFeatures: dados.caracteristicasImovel,
        condoFeatures: dados.caracteristicasCondominio,
        isLaunch: dados.lancamento,
        isFeatured: dados.destaque,
        isOpportunity: dados.oportunidade,
        hasSlideshow: dados.slideshow,
        constructionStage: dados.estagioObra || null,
        deliveryForecast: parseMesAno(dados.previsaoEntrega),
        developer: dados.construtora || null,
        responsibleMemberId: session.user.organizationMemberId ?? null,
        publishedAt: dados.status === "AVAILABLE" ? new Date() : null,
        media: { create: midias.map((m) => ({ ...m, organizationId })) },
        statusHistory: {
          create: { previousStatus: null, newStatus: dados.status, organizationId },
        },
      },
    })
  );

  revalidatePath("/app/imoveis");
  redirect(`/app/imoveis/${imovel.id}?salvo=1`);
}

export async function atualizarImovel(imovelId: string, formData: FormData) {
  const session = await auth();
  if (!session) redirect("/app/login");

  const dados = parseFormData(formData);
  const midias = parseMidias(dados.midiasJson);

  const organizationId = await requireOrganizationId();

  await withOrganization(organizationId, async () => {
    const imovelAtual = await prisma.property.findUniqueOrThrow({
      where: { id: imovelId, organizationId },
      select: { status: true, publishedAt: true },
    });

    const statusMudou = imovelAtual.status !== dados.status;

    await prisma.$transaction([
      prisma.media.deleteMany({ where: { propertyId: imovelId, organizationId } }),
      prisma.property.update({
        where: { id: imovelId, organizationId },
        data: {
          title: dados.titulo,
          description: dados.descricao || null,
          type: dados.tipo,
          purpose: dados.finalidade,
          status: dados.status,
          zipCode: dados.cep || null,
          street: dados.logradouro || null,
          number: dados.numero || null,
          complement: dados.complemento || null,
          neighborhood: dados.bairro,
          city: dados.cidade,
          state: dados.estado.toUpperCase(),
          latitude: dados.latitude ?? null,
          longitude: dados.longitude ?? null,
          price: dados.preco ?? null,
          rentPrice: dados.precoAluguel ?? null,
          condoFee: dados.precoCondominio ?? null,
          propertyTax: dados.precoIptu ?? null,
          totalArea: dados.areaTotal ?? null,
          privateArea: dados.areaPrivativa ?? null,
          bedrooms: dados.quartos ?? null,
          suites: dados.suites ?? null,
          bathrooms: dados.banheiros ?? null,
          parkingSpots: dados.vagasGaragem ?? null,
          propertyFeatures: dados.caracteristicasImovel,
          condoFeatures: dados.caracteristicasCondominio,
          isLaunch: dados.lancamento,
          isFeatured: dados.destaque,
          isOpportunity: dados.oportunidade,
          hasSlideshow: dados.slideshow,
          constructionStage: dados.estagioObra || null,
          deliveryForecast: parseMesAno(dados.previsaoEntrega),
          developer: dados.construtora || null,
          publishedAt:
            dados.status === "AVAILABLE" && !imovelAtual.publishedAt
              ? new Date()
              : undefined,
          media: { create: midias.map((m) => ({ ...m, organizationId })) },
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

  revalidatePath("/app/imoveis");
  revalidatePath(`/app/imoveis/${imovelId}`);
  redirect(`/app/imoveis/${imovelId}?salvo=1`);
}
