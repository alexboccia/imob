import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  Users,
  KanbanSquare,
  CalendarClock,
  Megaphone,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buscarConfiguracaoSuporte } from "@/lib/plataforma-suporte-dados";
import { linkWhatsAppSuporte, telefoneSuporteE164, temTelefoneSuporte } from "@/lib/plataforma-suporte";

// =======================================================================
// Landing page institucional do SaaS — Fase 116 (REQ WEB-001)
// =======================================================================
// Não existia nenhuma página que apresentasse o PRODUTO (Sistema
// Imobiliário) em si — só o site público de CADA imobiliária cliente,
// em `src/app/[orgSlug]/...`. Esta página vive FORA de `[orgSlug]` de
// propósito, pra nunca ser confundida com o site de uma imobiliária.
//
// DELIBERADAMENTE NÃO DIVULGADA (instrução explícita da Fase 116):
// - `robots: { index: false, follow: false }` abaixo — nunca indexada.
// - Não aparece em `src/app/sitemap.ts` (que só lista páginas por
//   organização) nem precisa de ajuste em `src/app/robots.ts` (que já só
//   libera o conteúdo por organização; esta rota simplesmente não é
//   referenciada em lugar nenhum).
// - Nenhum link para esta rota existe em nenhuma outra página do
//   produto — só é alcançável por quem já tem a URL.
// - Não é um rewrite de `next.config.ts`/`rotas-publicas.ts` (que só
//   cobre as famílias de rota de `[orgSlug]`), então nenhum domínio de
//   organização jamais responde aqui.
//
// Reaproveita texto comercial já validado em
// `docs/comercial/01-apresentacao-comercial.md` (Fase 113) — nenhuma
// frase nova inventada aqui. Preços: nenhum valor da Fase 113/114 é
// exibido como aprovado (ver `docs/comercial/demo-remota/06-landing-page.md`).

export const metadata: Metadata = {
  // `title.absolute` ignora o template "%s | {nome da organização
  // padrão}" do layout raiz — esta página é do PRODUTO, não de uma
  // imobiliária, então não deve herdar o sufixo de nenhuma organização.
  title: { absolute: "Sistema Imobiliário — CRM para imobiliárias" },
  description:
    "CRM que organiza imóveis, clientes, negociações, agenda e comissões da sua imobiliária em um só lugar.",
  robots: { index: false, follow: false },
};

// Sem isso o Next prerenderia esta página como estática no build (não
// tem params/cookies que forcem renderização dinâmica), congelando o
// telefone de suporte lido de `PlatformSettings` no momento do build —
// uma troca feita depois em /platform/configuracoes só apareceria aqui
// no próximo deploy. Força leitura fresca do banco a cada requisição.
export const dynamic = "force-dynamic";

const DIFERENCIAIS = [
  {
    Icone: KanbanSquare,
    titulo: "Pipeline visual real",
    texto:
      "Cada negociação mostra em qual etapa está e há quanto tempo, com base no histórico real de mudanças de etapa.",
  },
  {
    Icone: Users,
    titulo: "Responsável sempre identificado",
    texto:
      "Mesmo em equipes colaborativas, o sistema sabe de quem é cada compromisso e cada negociação.",
  },
  {
    Icone: Megaphone,
    titulo: "Gerador de divulgação com dados reais",
    texto:
      "Nome do imóvel, preço, bairro e foto reais compõem a imagem — nunca um dado inventado quando a informação não existe.",
  },
  {
    Icone: Wallet,
    titulo: "Comissão por negociação",
    texto:
      "Divisão entre participantes e controle de pagamento: cada corretor sabe o que já recebeu e o que falta.",
  },
  {
    Icone: ShieldCheck,
    titulo: "Isolamento total entre imobiliárias",
    texto:
      "Arquitetura multi-tenant: uma imobiliária nunca vê dado de outra, mesmo rodando na mesma plataforma.",
  },
];

const JORNADA = [
  { Icone: Building2, titulo: "Imóvel", texto: "Cadastro completo, com fotos e características." },
  { Icone: Users, titulo: "Cliente", texto: "Ficha centralizada, histórico preservado." },
  { Icone: KanbanSquare, titulo: "Negociação", texto: "Pipeline por etapas, do interesse ao fechamento." },
  { Icone: CalendarClock, titulo: "Agenda", texto: "Visitas e follow-ups vinculados ao negócio." },
  { Icone: Wallet, titulo: "Comissão", texto: "Valor e divisão registrados no fechamento." },
];

const FAQ = [
  {
    pergunta: "O sistema cadastra imóveis para venda e locação?",
    resposta:
      "Sim, os dois — inclusive imóveis que aceitam ambas as finalidades, com preços tratados separadamente.",
  },
  {
    pergunta: "Meus dados ficam misturados com os de outra imobiliária?",
    resposta:
      "Não — cada imobiliária é isolada das demais por arquitetura (multi-tenant), validado extensivamente em testes automatizados.",
  },
  {
    pergunta: "O sistema calcula a comissão automaticamente com um percentual fixo?",
    resposta:
      "Não — o valor é informado pelo corretor/gestor no fechamento de cada negócio, porque cada imobiliária tem sua própria regra.",
  },
  {
    pergunta: "Tem integração com portais de anúncio (ZAP, VivaReal etc.)?",
    resposta: "Não, atualmente não há essa integração.",
  },
];

export default async function SistemaImobiliarioPage() {
  const configuracaoSuporte = await buscarConfiguracaoSuporte();
  const digitosSuporte = configuracaoSuporte.telefoneDigitos;
  const temContato = temTelefoneSuporte(digitosSuporte);
  const linkContato = linkWhatsAppSuporte(
    digitosSuporte,
    "Olá! Gostaria de solicitar uma demonstração do Sistema Imobiliário."
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-20 px-6 py-16">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          O sistema que organiza sua imobiliária do primeiro contato ao fechamento
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          CRM para imobiliárias que centraliza imóveis, clientes, negociações, agenda e
          comissões em um só lugar — com site próprio para a sua imobiliária e gerador
          automático de materiais de divulgação a partir de fotos reais dos imóveis.
        </p>
        {temContato && linkContato ? (
          <a
            href={linkContato}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            Solicitar demonstração
          </a>
        ) : null}
      </section>

      {/* Problema */}
      <section className="flex flex-col gap-4 text-center">
        <h2 className="text-2xl font-semibold">O dia a dia que custa oportunidades de venda</h2>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Planilhas, grupos de WhatsApp e cadernos ainda administram boa parte do dia a dia
          de pequenas e médias imobiliárias — o que custa oportunidades esquecidas, retrabalho
          na divulgação de imóveis e falta de visibilidade sobre o que cada corretor está fazendo.
        </p>
      </section>

      {/* Jornada */}
      <section className="flex flex-col gap-8">
        <h2 className="text-center text-2xl font-semibold">Uma jornada só, do imóvel ao fechamento</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {JORNADA.map(({ Icone, titulo, texto }) => (
            <div key={titulo} className="flex flex-col items-center gap-2 text-center">
              <Icone className="size-6 text-primary" aria-hidden />
              <p className="text-sm font-medium">{titulo}</p>
              <p className="text-xs text-muted-foreground">{texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Diferenciais */}
      <section className="flex flex-col gap-8">
        <h2 className="text-center text-2xl font-semibold">Diferenciais demonstráveis na hora</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {DIFERENCIAIS.map(({ Icone, titulo, texto }) => (
            <Card key={titulo}>
              <CardContent className="flex gap-3">
                <Icone className="size-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="font-medium">{titulo}</p>
                  <p className="text-sm text-muted-foreground">{texto}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Planos — nenhum valor não aprovado é exibido (Fase 116, Parte H) */}
      <section className="flex flex-col items-center gap-3 text-center">
        <h2 className="text-2xl font-semibold">Planos</h2>
        <p className="max-w-xl text-muted-foreground">
          Conheça nossos planos — solicite uma demonstração e receba a condição ideal para o
          tamanho da sua equipe.
        </p>
        {temContato && linkContato ? (
          <a
            href={linkContato}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Falar sobre planos
          </a>
        ) : null}
      </section>

      {/* FAQ */}
      <section className="flex flex-col gap-6">
        <h2 className="text-center text-2xl font-semibold">Perguntas frequentes</h2>
        <div className="flex flex-col gap-4">
          {FAQ.map(({ pergunta, resposta }) => (
            <div key={pergunta}>
              <p className="font-medium">{pergunta}</p>
              <p className="text-sm text-muted-foreground">{resposta}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contato */}
      <section className="flex flex-col items-center gap-3 text-center">
        <h2 className="text-2xl font-semibold">Fale com a gente</h2>
        {temContato && linkContato ? (
          <>
            <p className="text-muted-foreground">
              Atendimento de segunda a sexta-feira,{" "}
              {configuracaoSuporte.horarioAtendimento ?? "9h às 18h"} (horário de Brasília).
            </p>
            <a
              href={linkContato}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: "lg" }))}
            >
              WhatsApp {telefoneSuporteE164(digitosSuporte ?? "")}
            </a>
          </>
        ) : (
          <p className="text-muted-foreground">
            Canal de contato ainda não configurado. Peça para o administrador da plataforma
            preencher em{" "}
            <Link href="/platform/configuracoes" className="underline">
              /platform/configuracoes
            </Link>
            .
          </p>
        )}
      </section>
    </main>
  );
}
