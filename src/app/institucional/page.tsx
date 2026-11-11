import { Building2, CalendarClock, KanbanSquare, Megaphone, ShieldCheck, Users, Wallet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { agoraEmMs } from "@/lib/tempo";
import { LeadForm } from "./LeadForm";

const LOGO_SYNTAKS = "/brand/syntaks-logo.png";

const PROBLEMAS = [
  { titulo: "Informação espalhada", texto: "Cada corretor guarda contato de cliente no próprio celular — perdido quando ele sai." },
  { titulo: "Negociação esquecida", texto: "Oportunidade perdida porque ninguém percebeu que o cliente ficou tempo demais sem retorno." },
  { titulo: "Divulgação trabalhosa", texto: "Divulgar um imóvel exige designer ou tempo que o corretor não tem sobrando." },
  { titulo: "Zero visibilidade comercial", texto: "O gestor não sabe o que cada corretor tem na carteira nem de onde vêm os leads." },
  { titulo: "Retrabalho constante", texto: "O mesmo dado de imóvel digitado de novo em cada canal onde ele é divulgado." },
];

const FUNCIONALIDADES = [
  {
    Icone: KanbanSquare,
    titulo: "Pipeline visual, sem negociação esquecida",
    texto:
      "Cada negociação mostra em qual etapa está e há quanto tempo — com base no histórico real de mudança de etapa, nunca na \"última edição\". Interessado → Visita → Proposta → Ganho/Perdido.",
  },
  {
    Icone: Megaphone,
    titulo: "Divulgação pronta em segundos",
    texto:
      "A partir de uma foto real já cadastrada, o sistema compõe a imagem para Instagram Feed, Story ou WhatsApp com preço, bairro e características reais do imóvel. Sem IA alterando a foto.",
  },
  {
    Icone: Wallet,
    titulo: "Visibilidade real da operação",
    texto:
      "De onde vêm os leads, quanto cada corretor tem na carteira e o resultado financeiro do período — sem planilha manual. Comissão registrada por negociação, dividida entre participantes.",
  },
];

const COMO_FUNCIONA = [
  { titulo: "Conheça a plataforma", texto: "Demonstração guiada com o produto real, sem dado fictício genérico." },
  { titulo: "Configure sua imobiliária", texto: "Identidade visual, equipe e permissões em minutos." },
  { titulo: "Cadastre seus imóveis", texto: "Catálogo único, já publicado automaticamente no seu site." },
  { titulo: "Gerencie e acompanhe", texto: "Negociação, agenda e comissão sob controle, todos os dias." },
];

const FAQ = [
  {
    pergunta: "O sistema cadastra imóveis para venda e locação?",
    resposta: "Sim, os dois — inclusive imóveis que aceitam ambas as finalidades, com preços tratados separadamente.",
  },
  {
    pergunta: "É possível personalizar a identidade visual do meu site?",
    resposta: "Sim — logotipo e cores próprios no site da sua imobiliária, independente da marca Syntaks.",
  },
  {
    pergunta: "Meus dados ficam misturados com os de outras imobiliárias?",
    resposta:
      "Não — isolamento total entre imobiliárias por arquitetura, validado em testes automatizados ao longo do desenvolvimento.",
  },
  {
    pergunta: "Tem integração com portais de anúncio (ZAP, VivaReal etc.)?",
    resposta: "Não, atualmente não há essa integração.",
  },
  {
    pergunta: "Como funciona a demonstração?",
    resposta: "Guiada, com o produto real e dados de exemplo — sem compromisso.",
  },
];

function Captura({ rotulo }: { rotulo: string }) {
  return (
    <div
      className="flex aspect-[16/11] w-full items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center text-sm font-semibold"
      style={{ background: "var(--syntaks-soft)", borderColor: "#C7D4EA", color: "var(--syntaks-gray)" }}
    >
      [ captura real — {rotulo} ]
    </div>
  );
}

export default function InstitucionalPage() {
  return (
    <div className="flex flex-col" style={{ color: "var(--syntaks-navy)" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-19 max-w-6xl items-center justify-between gap-6 px-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo estático de public/, fora do pipeline de otimização de imagem do next/image */}
          <img src={LOGO_SYNTAKS} alt="syntaks — software de gestão imobiliária" height={34} className="h-[34px] w-auto" />
          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 sm:flex">
            <a href="#funcionalidades" className="hover:text-[var(--syntaks-blue)]">Funcionalidades</a>
            <a href="#site-imobiliario" className="hover:text-[var(--syntaks-blue)]">Site imobiliário</a>
            <a href="#como-funciona" className="hover:text-[var(--syntaks-blue)]">Como funciona</a>
            <a href="#faq" className="hover:text-[var(--syntaks-blue)]">FAQ</a>
          </nav>
          <a
            href="#demo"
            className={cn(buttonVariants())}
          >
            Agendar demonstração
          </a>
        </div>
      </header>

      {/* Hero */}
      <section style={{ background: `linear-gradient(180deg, var(--syntaks-soft) 0%, #fff 100%)` }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-14 px-6 py-20">
          <div className="flex min-w-80 flex-1 flex-col gap-5">
            <span
              className="inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold"
              style={{ color: "var(--syntaks-blue)", borderColor: "#E3EAF7" }}
            >
              Software de gestão imobiliária
            </span>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Sua imobiliária mais organizada. Seu negócio pronto para crescer.
            </h1>
            <p className="max-w-xl text-lg text-slate-600">
              Gerencie imóveis, clientes e negociações em uma plataforma moderna, com site
              imobiliário integrado e gerador de divulgação a partir de fotos reais.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <a
                href="#demo"
                className={cn(buttonVariants({ size: "lg" }))}
              >
                Agendar demonstração
              </a>
              <a href="#funcionalidades" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
                Conhecer funcionalidades
              </a>
            </div>
          </div>
          <div className="min-w-80 flex-1">
            <Captura rotulo="Dashboard / Central de Trabalho" />
          </div>
        </div>
      </section>

      {/* Problema */}
      <section className="py-18">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 max-w-xl">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--syntaks-blue)" }}>
              O problema
            </span>
            <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight">
              Planilha, WhatsApp e caderno não escalam com o seu negócio
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PROBLEMAS.map(({ titulo, texto }) => (
              <Card key={titulo}>
                <CardContent>
                  <p className="font-bold">{titulo}</p>
                  <p className="mt-2 text-sm text-slate-600">{texto}</p>
                </CardContent>
              </Card>
            ))}
            <Card style={{ background: "var(--syntaks-soft)", borderColor: "#E3EAF7" }}>
              <CardContent>
                <p className="font-bold" style={{ color: "var(--syntaks-blue)" }}>A solução</p>
                <p className="mt-2 text-sm text-slate-700">
                  Um sistema único: imóvel → cliente → negociação → fechamento → comissão →
                  divulgação, tudo no mesmo lugar.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Funcionalidades (editorial alternado) */}
      <section id="funcionalidades" className="bg-slate-50 py-18">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 max-w-xl">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--syntaks-blue)" }}>
              A plataforma
            </span>
            <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight">
              Tudo que a gestão comercial da sua imobiliária precisa
            </h2>
          </div>
          <div className="flex flex-col gap-16">
            {FUNCIONALIDADES.map(({ Icone, titulo, texto }, i) => (
              <div
                key={titulo}
                className={`flex flex-wrap items-center gap-12 ${i % 2 === 1 ? "sm:flex-row-reverse" : ""}`}
              >
                <div className="min-w-80 flex-1">
                  <Captura rotulo={titulo} />
                </div>
                <div className="min-w-80 flex-1 space-y-3">
                  <Icone className="size-7" style={{ color: "var(--syntaks-blue)" }} aria-hidden />
                  <h3 className="text-xl font-extrabold tracking-tight">{titulo}</h3>
                  <p className="leading-relaxed text-slate-600">{texto}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Site imobiliário integrado */}
      <section id="site-imobiliario" className="py-20 text-white" style={{ background: "var(--syntaks-navy)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-12 px-6">
          <div className="min-w-80 flex-1 space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-300">Site imobiliário integrado</span>
            <h2 className="text-3xl font-extrabold tracking-tight">
              Cada imobiliária com seu próprio site, sem contratar mais nada
            </h2>
            <p className="leading-relaxed text-slate-300">
              Logotipo e cores próprias, catálogo de imóveis, busca e filtros, página de
              detalhes e formulário de contato — tudo conectado direto na gestão
              administrativa. O interessado que preenche o formulário no site vira
              negociação no pipeline automaticamente.
            </p>
          </div>
          <div className="min-w-80 flex-1">
            <div className="flex aspect-[16/11] w-full items-center justify-center rounded-2xl border-2 border-dashed border-white/20 bg-white/5 p-6 text-center text-sm font-semibold text-slate-300">
              [ captura real — site público de uma imobiliária cliente ]
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="py-18">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 max-w-xl">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--syntaks-blue)" }}>
              Como funciona
            </span>
            <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight">Do primeiro acesso à operação rodando</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {COMO_FUNCIONA.map(({ titulo, texto }, i) => (
              <div key={titulo}>
                <div
                  className="mb-3.5 flex size-9 items-center justify-center rounded-lg text-sm font-extrabold text-white"
                  style={{ background: "var(--syntaks-blue)" }}
                >
                  {i + 1}
                </div>
                <p className="font-bold">{titulo}</p>
                <p className="mt-1.5 text-sm text-slate-600">{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Diferenciais (ícones) */}
      <section className="bg-slate-50 py-18">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 max-w-xl">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--syntaks-blue)" }}>
              Diferenciais
            </span>
            <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight">Demonstráveis na hora, não só prometidos</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {[
              { Icone: Users, titulo: "Responsável sempre identificado", texto: "Mesmo em equipes colaborativas, o sistema sabe de quem é cada compromisso e cada negociação." },
              { Icone: ShieldCheck, titulo: "Isolamento total entre imobiliárias", texto: "Arquitetura multi-tenant: uma imobiliária nunca vê dado de outra, mesmo rodando na mesma plataforma." },
              { Icone: Building2, titulo: "Catálogo único, venda e locação", texto: "Preço e informações tratados separadamente — nunca mostra preço de aluguel como se fosse de venda." },
              { Icone: CalendarClock, titulo: "Agenda vinculada à negociação real", texto: "Visita agendada com responsável identificado, mesmo em equipe colaborativa." },
            ].map(({ Icone, titulo, texto }) => (
              <Card key={titulo}>
                <CardContent className="flex gap-3.5">
                  <Icone className="size-5 shrink-0" style={{ color: "var(--syntaks-blue)" }} aria-hidden />
                  <div>
                    <p className="font-bold">{titulo}</p>
                    <p className="mt-1 text-sm text-slate-600">{texto}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Planos — neutro, sem valor não aprovado */}
      <section className="py-16" style={{ background: "var(--syntaks-soft)" }}>
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-6 text-center">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--syntaks-blue)" }}>Planos</span>
          <h2 className="text-2xl font-extrabold tracking-tight">Conheça nossos planos — solicite uma demonstração</h2>
          <a
            href="#demo"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            Agendar demonstração
          </a>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-18">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-14 px-6">
          <div className="min-w-70 flex-1">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--syntaks-blue)" }}>
              Perguntas frequentes
            </span>
            <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight">Direto ao ponto</h2>
          </div>
          <div className="flex min-w-80 flex-[2] flex-col gap-5">
            {FAQ.map(({ pergunta, resposta }) => (
              <div key={pergunta}>
                <p className="font-bold">{pergunta}</p>
                <p className="mt-1 text-sm text-slate-600">{resposta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demonstração (formulário) */}
      <section id="demo" className="py-20">
        <div className="mx-auto flex max-w-4xl flex-wrap gap-14 px-6">
          <div className="min-w-70 flex-1 space-y-3">
            <h2 className="text-3xl font-extrabold tracking-tight">Pronto para transformar a gestão da sua imobiliária?</h2>
            <p className="text-slate-600">
              Preencha ao lado e combinamos uma demonstração guiada, com o produto real —
              sem compromisso.
            </p>
          </div>
          <div className="min-w-80 flex-1 rounded-2xl border p-6">
            <LeadForm renderizadoEm={agoraEmMs()} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-8 px-6">
          <div className="max-w-70 space-y-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo estático de public/, fora do pipeline de otimização de imagem do next/image */}
            <img src={LOGO_SYNTAKS} alt="syntaks" height={24} className="h-6 w-auto" />
            <p className="text-sm text-slate-500">
              Software de gestão imobiliária. Empresa de engenharia de software e produtos SaaS.
            </p>
          </div>
          <div className="flex flex-wrap gap-14 text-sm">
            <div className="space-y-2.5">
              <p className="font-bold">Produto</p>
              <a href="#funcionalidades" className="block text-slate-600 hover:text-[var(--syntaks-blue)]">Funcionalidades</a>
              <a href="#site-imobiliario" className="block text-slate-600 hover:text-[var(--syntaks-blue)]">Site imobiliário</a>
              <a href="#como-funciona" className="block text-slate-600 hover:text-[var(--syntaks-blue)]">Como funciona</a>
            </div>
            <div className="space-y-2.5">
              <p className="font-bold">Legal</p>
              <span className="block text-slate-500">Política de Privacidade (em preparação)</span>
            </div>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-6xl px-6 text-xs text-slate-400">
          © {new Date().getFullYear()} syntaks. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}
