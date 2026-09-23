import type { Metadata } from "next";
import Image from "next/image";
import {
  ChartNoAxesColumn,
  Megaphone,
  Users,
  House,
  CalendarDays,
  FileText,
  UserRound,
} from "lucide-react";
import { AnuncieForm } from "@/components/AnuncieForm";
import { IconeTelefone, IconeWhatsApp } from "@/components/icons";
import { metadataPaginaPublica } from "@/lib/seo";
import { getOrganizationBySlug } from "@/lib/tenant";
import { resolverBasePath } from "@/lib/site-url";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { buscarAtuacaoOrganizacao, formatarAtuacao } from "@/lib/atuacao-organizacao";
import { normalizarHorario } from "@/lib/contatos-publicos";
import { linkWhatsApp } from "@/lib/whatsapp";
import { TITULO_SECAO } from "@/lib/site-typography";

// =======================================================================
// Anuncie seu imóvel — landing de captação (Fase 60)
// =======================================================================
// A página era um formulário sobre fundo branco. Virou uma landing de
// conversão: proposta de valor à esquerda, formulário à direita, faixa
// institucional e as três etapas do processo.
//
// O QUE **NÃO** MUDOU, e é o essencial: o formulário continua sendo o
// mesmo componente, chamando a MESMA Server Action
// (`enviarAnuncioProprietario`), com o mesmo schema, honeypot, janela
// anti-spam, rate limit, deduplicação de Person, origem de captação,
// notificação e mensagens. Esta fase é de apresentação.
//
// MULTI-TENANT: nada institucional é fixo no código. Telefone, WhatsApp
// e horário vêm da configuração da organização; a região de atuação é
// derivada dos imóveis que ela publica (não existe campo de endereço no
// schema — ver atuacao-organizacao.ts). Dado ausente não vira
// placeholder: o item simplesmente não aparece.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  const basePath = resolverBasePath(orgSlug);
  return metadataPaginaPublica({
    title: "Anuncie seu imóvel",
    description:
      "Conte um pouco sobre o seu imóvel e um corretor entrará em contato para avaliar e preparar o anúncio.",
    path: `${basePath}/anuncie`,
    siteName: organization?.name,
  });
}

const BENEFICIOS = [
  {
    Icone: ChartNoAxesColumn,
    titulo: "Avaliação especializada",
    texto: "Preço justo e realista para o seu imóvel.",
  },
  {
    Icone: Megaphone,
    titulo: "Divulgação profissional",
    texto: "Seu imóvel nos principais canais.",
  },
  {
    Icone: Users,
    titulo: "Atendimento personalizado",
    texto: "Acompanhamento em todas as etapas.",
  },
];

const ETAPAS = [
  {
    Icone: FileText,
    titulo: "Envie os dados",
    texto: "Preencha o formulário com as informações do seu imóvel.",
  },
  {
    Icone: UserRound,
    titulo: "Entramos em contato",
    texto: "Um corretor da nossa equipe retornará em breve.",
  },
  {
    Icone: House,
    titulo: "Avaliamos e divulgamos",
    texto: "Seu imóvel será avaliado e anunciado nos nossos canais.",
  },
];

export default async function AnunciePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  const basePath = resolverBasePath(orgSlug);

  // Sem organização não há dado institucional nenhum — a página continua
  // servindo o formulário, que resolve o tenant por conta própria.
  const config = organization ? await buscarConfiguracaoContato(organization.id) : null;
  const atuacao = organization ? await buscarAtuacaoOrganizacao(organization.id) : null;

  const regiao = formatarAtuacao(atuacao);
  const horario = normalizarHorario(config?.horario.valor);
  const telefone = (config?.telefone ?? "").trim();
  const telefoneDigitos = telefone.replace(/\D/g, "");
  const hrefWhatsApp = linkWhatsApp(
    config?.whatsapp,
    organization ? `Olá! Quero anunciar meu imóvel com a ${organization.name}.` : undefined
  );

  // Cada item só existe quando o dado existe — nada de placeholder, e os
  // separadores nascem da própria grade, então não sobra traço órfão.
  type ItemFaixa = {
    chave: string;
    // Aceita tanto os ícones do projeto quanto os do lucide (que são
    // ForwardRef): o tipo comum é "componente que recebe className".
    Icone: React.ComponentType<{ className?: string }>;
    titulo: string;
    texto: string;
    href?: string;
    externo?: boolean;
    /** Verde da marca do WhatsApp — a única cor de terceiro aqui. */
    marca?: boolean;
  };

  const itensFaixa: ItemFaixa[] = [];
  if (regiao) {
    itensFaixa.push({ chave: "atuacao", Icone: House, titulo: "Atuação em", texto: regiao });
  }
  if (horario) {
    itensFaixa.push({
      chave: "horario",
      Icone: CalendarDays,
      titulo: "Atendimento",
      texto: horario,
    });
  }
  // Mesmo piso do resto do produto: abaixo disso é número incompleto, e
  // um `tel:` quebrado é pior que nenhum telefone.
  if (telefone && telefoneDigitos.length >= 8) {
    itensFaixa.push({
      chave: "telefone",
      Icone: IconeTelefone,
      titulo: telefone,
      texto: "Ligue para nossa equipe",
      href: `tel:+${telefoneDigitos}`,
    });
  }
  if (hrefWhatsApp) {
    itensFaixa.push({
      chave: "whatsapp",
      Icone: IconeWhatsApp,
      titulo: "Fale no WhatsApp",
      texto: "Atendimento rápido",
      href: hrefWhatsApp,
      externo: true,
      marca: true,
    });
  }

  return (
    <>
      {/* ---------------------------------------------------------------
          HERO
          --------------------------------------------------------------- */}
      <section data-hero-anuncie className="relative isolate overflow-hidden">
        {/* A fotografia é decorativa: tudo o que ela comunica já está
            escrito ao lado, então `alt` vazio evita que o leitor de tela
            anuncie um nome de arquivo. `priority` porque ela É o LCP
            desta página — adiar o carregamento pioraria a métrica que a
            imagem determina. */}
        <Image
          src="/anuncie-hero.webp"
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover object-center"
        />

        {/* Legibilidade por GRADIENTE, nunca editando a foto: quase
            opaco onde o texto vive e transparente em direção à imagem.
            No mobile a coluna ocupa a largura toda, então o véu é
            vertical; a partir de lg ele passa a ser horizontal, que é
            quando existe uma "esquerda" de fato. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-b from-white/95 via-white/80 to-white/40 lg:bg-gradient-to-r lg:from-white/95 lg:via-white/75 lg:to-transparent"
        />

        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-2 lg:items-center lg:gap-12 lg:py-20">
          {/* Coluna comercial */}
          <div className="min-w-0">
            <p className="flex items-center gap-3 text-sm font-semibold tracking-widest text-primary uppercase">
              <span aria-hidden="true" className="h-px w-8 bg-primary" />
              Venda ou alugue
            </p>
            <h1 className="mt-4 text-4xl leading-tight font-bold text-gray-900 sm:text-5xl">
              Anuncie seu imóvel com quem entende de valor.
            </h1>
            <p className="mt-4 max-w-prose text-base text-gray-700 sm:text-lg">
              Nossa equipe está pronta para avaliar, divulgar e conectar o seu imóvel aos
              melhores compradores e locatários.
            </p>

            <ul className="mt-8 space-y-5">
              {BENEFICIOS.map(({ Icone, titulo, texto }) => (
                <li key={titulo} className="flex min-w-0 items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <Icone className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-gray-900">{titulo}</span>
                    <span className="block text-sm text-gray-700">{texto}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Cartão do formulário */}
          <div className="min-w-0 rounded-2xl bg-background p-6 shadow-xl ring-1 ring-black/5 sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900">Anuncie seu imóvel</h2>
            <p className="mt-2 text-sm text-gray-600">
              Conte um pouco sobre o seu imóvel e um corretor entrará em contato para avaliar
              e preparar o anúncio.
            </p>
            <div className="mt-6">
              <AnuncieForm orgSlug={orgSlug} basePath={basePath} />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          FAIXA INSTITUCIONAL — só o que a organização configurou
          --------------------------------------------------------------- */}
      {itensFaixa.length > 0 && (
        <section data-faixa-anuncie className="border-y bg-background">
          <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-x-8 gap-y-6 px-4 py-6 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border">
            {itensFaixa.map((item) => {
              const { Icone } = item;
              const conteudo = (
                <>
                  <span
                    aria-hidden="true"
                    className={
                      item.marca
                        ? "flex size-10 shrink-0 items-center justify-center rounded-full text-whatsapp-brand"
                        : "flex size-10 shrink-0 items-center justify-center rounded-full text-primary"
                    }
                  >
                    <Icone className="size-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-gray-900">{item.titulo}</span>
                    <span className="block text-sm text-gray-600">{item.texto}</span>
                  </span>
                </>
              );
              return (
                <li
                  key={item.chave}
                  data-item-faixa={item.chave}
                  className="flex min-w-0 items-center gap-3 lg:px-6 lg:first:pl-0 lg:last:pr-0"
                >
                  {item.href ? (
                    <a
                      href={item.href}
                      target={item.externo ? "_blank" : undefined}
                      rel={item.externo ? "noopener noreferrer" : undefined}
                      className="flex min-w-0 items-center gap-3 rounded transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
                    >
                      {conteudo}
                    </a>
                  ) : (
                    conteudo
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------------
          COMO FUNCIONA
          --------------------------------------------------------------- */}
      <section data-como-funciona className="bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <p className="flex items-center gap-3 text-sm font-semibold tracking-widest text-primary uppercase">
            <span aria-hidden="true" className="h-px w-8 bg-primary" />
            Como funciona
          </p>
          <h2 className={`${TITULO_SECAO} mt-3`}>É simples anunciar seu imóvel</h2>

          <ol className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {ETAPAS.map(({ Icone, titulo, texto }, i) => (
              <li key={titulo} className="flex min-w-0 items-start gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary"
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="mb-1 flex items-center gap-2">
                    <Icone className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="font-semibold text-gray-900">{titulo}</span>
                  </span>
                  <span className="block text-sm text-gray-700">{texto}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
