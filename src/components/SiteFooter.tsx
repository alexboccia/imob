import Image from "next/image";
import Link from "next/link";
import {
  IconeInstagram,
  IconeFacebook,
  IconeYoutube,
  IconeLinkedin,
} from "@/components/icones-sociais";
import { resolverAparenciaRodape } from "@/lib/branding/aparencia-rodape";

type NavLink = { href: string; label: string };

const REDES = [
  { chave: "instagram" as const, Icone: IconeInstagram, label: "Instagram" },
  { chave: "facebook" as const, Icone: IconeFacebook, label: "Facebook" },
  { chave: "youtube" as const, Icone: IconeYoutube, label: "YouTube" },
  { chave: "linkedin" as const, Icone: IconeLinkedin, label: "LinkedIn" },
];

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
  aparencia,
  basePath,
  navLinks,
  redesSociais,
}: {
  nome: string;
  logo?: string | null;
  logoRodape?: string | null;
  aparencia?: string | null;
  basePath: string;
  navLinks: NavLink[];
  redesSociais: { instagram: string; facebook: string; youtube: string; linkedin: string };
}) {
  const redesAtivas = REDES.filter((r) => redesSociais[r.chave]);
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
                <span className="relative inline-flex h-11 items-center rounded-lg bg-white px-3">
                  <span className="relative block h-6 w-28">
                    <Image src={logoAtivo} alt={nome} fill sizes="112px" className="object-contain object-left" />
                  </span>
                </span>
              ) : (
                <span className="relative block h-11 w-28">
                  <Image src={logoAtivo} alt={nome} fill sizes="112px" className="object-contain object-left" />
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
            <div className="flex shrink-0 items-center gap-2">
              {redesAtivas.map(({ chave, Icone, label }) => (
                <a
                  key={chave}
                  href={redesSociais[chave]}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className={`flex size-9 items-center justify-center rounded-full transition-colors hover:bg-primary hover:text-primary-foreground ${cores.chipIcone}`}
                >
                  <Icone className="size-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className={`mt-8 border-t pt-6 text-center text-xs ${cores.borda} ${cores.textoMuted}`}>
          © {new Date().getFullYear()} {nome}. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
