import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hostnameInstitucional, normalizarHostname } from "@/lib/platform/hostname";
import { Header } from "../Header";
import { Footer } from "../Footer";

// Mesmo racional host-aware do layout.tsx pai (ver generateMetadata lá):
// indexável só sob o host institucional de verdade.
export async function generateMetadata(): Promise<Metadata> {
  const hostBruto = (await headers()).get("host");
  const host = hostBruto ? normalizarHostname(hostBruto) : null;
  const indexavel = host ? hostnameInstitucional(host) : false;

  return {
    title: "Planos e preços — Syntaks Imóveis",
    description:
      "Planos do Syntaks Imóveis por tamanho de equipe — todas as funcionalidades inclusas em todos os planos, sem módulo bloqueado.",
    robots: indexavel ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

// Valores da proposta de precificação já estudada (ver
// docs/comercial/07-precificacao.md) — nenhum valor inventado aqui.
// Todos os planos liberam as mesmas funcionalidades (ver mesmo
// documento, "Funcionalidades disponíveis: Todas"); o que muda entre
// eles é a faixa de usuários incluída.
const FUNCIONALIDADES_COMUNS = [
  "Imóveis e clientes ilimitados",
  "Pipeline de negociações",
  "Agenda e visitas",
  "Gerador de divulgação automático",
  "Comissões com divisão entre participantes",
  "Site imobiliário próprio",
  "Analytics comercial",
  "Suporte via WhatsApp",
];

const PLANOS = [
  {
    nome: "Piloto",
    preco: "R$ 149",
    nota: "Grátis por 60 dias, depois R$ 149/mês",
    usuarios: "Até 3 usuários",
    destaque: false,
  },
  {
    nome: "Essencial",
    preco: "R$ 249",
    nota: "R$ 249/mês",
    usuarios: "Até 10 usuários",
    destaque: true,
  },
  {
    nome: "Crescimento",
    preco: "R$ 449",
    nota: "R$ 449/mês",
    usuarios: "Até 25 usuários",
    destaque: false,
  },
] as const;

export default function PlanosPage() {
  return (
    <div className="flex flex-col" style={{ color: "var(--syntaks-navy)" }}>
      <Header />

      <section style={{ background: `linear-gradient(180deg, var(--syntaks-soft) 0%, #fff 100%)` }}>
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <span
            className="inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold"
            style={{ color: "var(--syntaks-blue)", borderColor: "#E3EAF7" }}
          >
            Planos
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Um plano para cada tamanho de equipe
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Todos os planos liberam o sistema completo — pipeline, agenda, comissões, site
            próprio e gerador de divulgação. O que muda é só o número de usuários incluídos.
          </p>
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 sm:grid-cols-3">
          {PLANOS.map((plano) => (
            <div
              key={plano.nome}
              className={cn(
                "flex flex-col rounded-2xl border p-7",
                plano.destaque ? "shadow-xl" : "shadow-sm"
              )}
              style={
                plano.destaque
                  ? { borderColor: "var(--syntaks-blue)", borderWidth: 2 }
                  : { borderColor: "#E5E9F2" }
              }
            >
              {plano.destaque && (
                <span
                  className="mb-3 w-fit rounded-full px-3 py-1 text-xs font-bold text-white"
                  style={{ background: "var(--syntaks-blue)" }}
                >
                  Mais escolhido
                </span>
              )}
              <p className="text-lg font-extrabold">{plano.nome}</p>
              <p className="mt-3 text-4xl font-extrabold tracking-tight">
                {plano.preco}
                <span className="text-base font-semibold text-slate-500">/mês</span>
              </p>
              <p className="mt-1 text-sm text-slate-500">{plano.nota}</p>
              <p className="mt-4 text-sm font-bold" style={{ color: "var(--syntaks-blue)" }}>
                {plano.usuarios}
              </p>

              <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
                {FUNCIONALIDADES_COMUNS.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0" style={{ color: "var(--syntaks-blue)" }} aria-hidden />
                    <span className="text-slate-700">{item}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/#demo"
                className={cn(
                  buttonVariants({ size: "lg", variant: plano.destaque ? "default" : "outline" }),
                  "mt-7 w-full"
                )}
              >
                Agendar demonstração
              </Link>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl px-6 text-center text-sm text-slate-500">
          Equipes maiores que 25 usuários: fale com a gente para um plano sob medida.
          Condições de cancelamento e portabilidade de dados são definidas na proposta
          comercial individual, antes de qualquer contratação.
        </p>
      </section>

      <Footer />
    </div>
  );
}
