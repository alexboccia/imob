import Image from "next/image";
import Link from "next/link";
import {
  IconeInstagram,
  IconeFacebook,
  IconeYoutube,
  IconeLinkedin,
  IconeTiktok,
} from "@/components/icones-sociais";
import { Clock } from "lucide-react";
import { IconeTelefone, IconeWhatsApp } from "@/components/icons";
import type { CanalPublico, ChaveCanal } from "@/lib/contatos-publicos";
import { LOGO_RODAPE_ALTURA_PADRAO, larguraCaixaLogoRodape } from "@/lib/logo";
import { resolverAparenciaRodape } from "@/lib/branding/aparencia-rodape";

type NavLink = { href: string; label: string };

// Fase 58 — a lista de canais e a decisão de quais aparecem saíram
// daqui para src/lib/contatos-publicos.ts, que o cabeçalho usa também.
// Aqui ficou só o mapa de ícones, que é apresentação.
const ICONES: Record<ChaveCanal, (props: { className?: string }) => React.ReactElement> = {
  telefone: IconeTelefone,
  whatsapp: IconeWhatsApp,
  instagram: IconeInstagram,
  facebook: IconeFacebook,
  linkedin: IconeLinkedin,
  youtube: IconeYoutube,
  tiktok: IconeTiktok,
};

// Proposta 2 (correção) tinha fundo escuro FIXO (slate-900) porque
// --primary varia de tema claro (Dourado, oklch L=0.62) a escuro
// (Grafite, oklch L=0.25) entre as 6 opções do catálogo (ver
// branding/temas.ts) — um fundo derivado direto de --primary ficaria
// ilegível/inconsistente pra metade dos temas. A configuração de
// aparência do rodapé (OrganizationBranding.footerAppearance, ver
// aparencia-rodape.ts) resolve isso sem abrir mão da escolha por
// organização: AUTO reproduz o MESMO visual de antes (color-mix escurece
// --primary em 45% na direção de preto, sem precisar de um token novo por
// tema), então nenhum tenant muda de aparência só por este campo existir.
// PRIMARY usa --primary/--primary-foreground como estão (já calibrados
// por tema, ver onPrimary em temas.ts). LIGHT é uma superfície clara
// estática, sem depender do tema.
const CORES_POR_APARENCIA: Record<
  ReturnType<typeof resolverAparenciaRodape>,
  {
    fundoStyle: React.CSSProperties;
    fundoClasse: string;
    texto: string;
    textoTitulo: string;
    textoMuted: string;
    borda: string;
    linkHover: string;
    chipIcone: string;
  }
> = {
  AUTO: {
    fundoStyle: { backgroundColor: "color-mix(in oklch, var(--primary), black 45%)" },
    fundoClasse: "",
    texto: "text-slate-300",
    textoTitulo: "text-white",
    textoMuted: "text-slate-400",
    borda: "border-white/10",
    linkHover: "hover:text-white",
    chipIcone: "bg-white/10 text-slate-300",
  },
  PRIMARY: {
    fundoStyle: { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" },
    fundoClasse: "",
    texto: "",
    textoTitulo: "",
    textoMuted: "opacity-80",
    borda: "border-white/15",
    linkHover: "hover:opacity-80",
    chipIcone: "bg-white/15",
  },
  LIGHT: {
    fundoStyle: {},
    fundoClasse: "bg-slate-50",
    texto: "text-slate-900",
    textoTitulo: "text-slate-900",
    textoMuted: "text-slate-500",
    borda: "border-slate-200",
    linkHover: "hover:text-slate-950",
    chipIcone: "bg-slate-900/5 text-slate-500",
  },
};

export function SiteFooter({
  nome,
  logo,
  logoRodape,
  logoRodapeAltura,
  aparencia,
  basePath,
  navLinks,
  canaisRodape,
  horarioRodape,
}: {
  nome: string;
  logo?: string | null;
  logoRodape?: string | null;
  logoRodapeAltura?: number | null;
  aparencia?: string | null;
  basePath: string;
  navLinks: NavLink[];
  // Fase 58 — canais já RESOLVIDOS para o rodapé (valor preenchido E
  // flag ligada), na mesma estrutura que o cabeçalho recebe.
  canaisRodape?: CanalPublico[];
  // Fase 58.3 — horário já resolvido para o rodapé (texto ou null).
  horarioRodape?: string | null;
}) {
  const canais = canaisRodape ?? [];
  const redesAtivas = canais.filter((c) => c.tipo === "REDE");
  const contatosAtivos = canais.filter((c) => c.tipo !== "REDE");
  const modo = resolverAparenciaRodape(aparencia);
  const cores = CORES_POR_APARENCIA[modo];
  // Logotipo dedicado ao rodapé (footerLogoUrl) tem prioridade — quem
  // configura um explicitamente já escolheu uma versão adequada ao fundo
  // (ver mockup/copy em ConfiguracaoContatoForm), então é exibido sem o
  // chip claro de contraste. Sem logotipo próprio, cai no mesmo do
  // cabeçalho — que pode não ter sido pensado pra um fundo escuro, daí o
  // chip claro continuar existindo como rede de segurança fora do LIGHT
  // (onde o próprio fundo já é claro).
  const logoAtivo = logoRodape ?? logo;
  const usarChip = !logoRodape && modo !== "LIGHT";
  // Altura configurável por organização (footerLogoHeight). Sem valor
  // salvo, cai no padrão que É o tamanho fixo que o rodapé sempre teve —
  // quem nunca configurou não vê diferença nenhuma. A largura acompanha a
  // altura na mesma proporção de antes, e como a imagem é object-contain,
  // a caixa é só o espaço máximo: o logo nunca distorce.
  const alturaLogo = logoRodapeAltura ?? LOGO_RODAPE_ALTURA_PADRAO;
  const larguraLogo = larguraCaixaLogoRodape(alturaLogo);

  return (
    <footer className={`mt-16 ${cores.fundoClasse} ${cores.texto}`} style={cores.fundoStyle}>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
        <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <Link href={basePath || "/"} className="shrink-0">
            {logoAtivo ? (
              usarChip ? (
                // Chip claro atrás do logo: contraste garantido em fundo
                // escuro sem forçar a recolorir a imagem enviada por cada
                // organização (que pode ter cores/gradiente próprios).
                <span
                  className="relative inline-flex items-center rounded-lg bg-white px-3"
                  style={{ height: alturaLogo }}
                >
                  {/* Respiro interno do chip: os mesmos 20px (44 - 24) que
                      ele já tinha no tamanho fixo, agora relativos à altura
                      escolhida — o logo nunca encosta na borda do chip. */}
                  <span
                    className="relative block"
                    style={{ height: Math.max(alturaLogo - 20, 12), width: larguraLogo }}
                  >
                    <Image src={logoAtivo} alt={nome} fill sizes={`${larguraLogo}px`} className="object-contain object-left" />
                  </span>
                </span>
              ) : (
                <span
                  className="relative block"
                  style={{ height: alturaLogo, width: larguraLogo }}
                >
                  <Image src={logoAtivo} alt={nome} fill sizes={`${larguraLogo}px`} className="object-contain object-left" />
                </span>
              )
            ) : (
              <span className={`text-xl font-bold ${cores.textoTitulo}`}>{nome}</span>
            )}
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className={`transition-colors ${cores.linkHover}`}>
                {link.label}
              </Link>
            ))}
          </nav>

          {redesAtivas.length > 0 && (
            <div className="flex shrink-0 items-center gap-2" data-redes-rodape>
              {redesAtivas.map((canal) => {
                const Icone = ICONES[canal.chave];
                return (
                  <a
                    key={canal.chave}
                    href={canal.href}
                    data-canal-rodape={canal.chave}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={canal.rotulo}
                    className={`flex size-9 items-center justify-center rounded-full transition-colors hover:bg-primary hover:text-primary-foreground ${cores.chipIcone}`}
                  >
                    <Icone className="size-4" />
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Fase 58 — bloco de CONTATO, que na 58.3 passou a abrigar
            também o horário de atendimento. Só existe quando há ALGO
            habilitado para o rodapé; sem nada, nem a linha nem o
            separador aparecem. Nenhum tenant ganha este bloco no deploy:
            todas as flags envolvidas nascem desligadas (ver schema).
            
            O horário vem PRIMEIRO: é o contexto do atendimento, e os
            meios de contato vêm em seguida — a mesma ordem da barra
            superior, para as duas pontas do site não se contradizerem. */}
        {(contatosAtivos.length > 0 || horarioRodape) && (
          <div
            data-contatos-rodape
            className={`mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t pt-6 text-sm ${cores.borda}`}
          >
            {horarioRodape && (
              <p data-horario-rodape className="flex min-w-0 items-center gap-2">
                {/* Decorativo: o próprio texto já diz que é horário de
                    atendimento, então o relógio não acrescenta
                    informação a quem usa leitor de tela. */}
                <Clock className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{horarioRodape}</span>
              </p>
            )}
            {contatosAtivos.map((canal) => {
              const Icone = ICONES[canal.chave];
              return (
                <a
                  key={canal.chave}
                  href={canal.href}
                  data-canal-rodape={canal.chave}
                  target={canal.externo ? "_blank" : undefined}
                  rel={canal.externo ? "noopener noreferrer" : undefined}
                  className={`inline-flex min-h-9 items-center gap-2 transition-colors ${cores.linkHover}`}
                >
                  <Icone className="size-4 shrink-0" />
                  <span className="whitespace-nowrap">{canal.texto}</span>
                </a>
              );
            })}
          </div>
        )}

        <div className={`mt-8 border-t pt-6 text-center text-xs ${cores.borda} ${cores.textoMuted}`}>
          © {new Date().getFullYear()} {nome}. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
