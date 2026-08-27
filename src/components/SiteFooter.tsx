import Image from "next/image";
import Link from "next/link";
import {
  IconeInstagram,
  IconeFacebook,
  IconeYoutube,
  IconeLinkedin,
} from "@/components/icones-sociais";

type NavLink = { href: string; label: string };

const REDES = [
  { chave: "instagram" as const, Icone: IconeInstagram, label: "Instagram" },
  { chave: "facebook" as const, Icone: IconeFacebook, label: "Facebook" },
  { chave: "youtube" as const, Icone: IconeYoutube, label: "YouTube" },
  { chave: "linkedin" as const, Icone: IconeLinkedin, label: "LinkedIn" },
];

// Proposta 2 (correção) — fundo escuro fixo (slate-900, "azul-marinho")
// em vez de derivar do --primary do tema: --primary varia de tema claro
// (ex: Dourado, oklch L=0.62) a escuro (ex: Grafite, oklch L=0.25) entre
// as 6 opções do catálogo (ver branding/temas.ts) — um fundo derivado
// direto da cor da organização ficaria ilegível/inconsistente pra metade
// delas. Fundo neutro escuro garante contraste e a leitura "premium
// escura" pedida em QUALQUER tema; a cor da organização ainda aparece
// como acento (hover dos links/ícones, ver classes primary abaixo) —
// mesmo racional já usado no overlay do HeroHome (neutro escuro + cor do
// tema só como acento local, nunca como base).
export function SiteFooter({
  nome,
  logo,
  basePath,
  navLinks,
  redesSociais,
}: {
  nome: string;
  logo?: string | null;
  basePath: string;
  navLinks: NavLink[];
  redesSociais: { instagram: string; facebook: string; youtube: string; linkedin: string };
}) {
  const redesAtivas = REDES.filter((r) => redesSociais[r.chave]);

  return (
    <footer className="mt-16 bg-slate-900 text-slate-300">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
        <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <Link href={basePath || "/"} className="shrink-0">
            {logo ? (
              // Chip claro atrás do logo: contraste garantido no footer
              // escuro sem forçar a recolorir a imagem enviada por cada
              // organização (que pode ter cores/gradiente próprios).
              <span className="relative inline-flex h-11 items-center rounded-lg bg-white px-3">
                <span className="relative block h-6 w-28">
                  <Image src={logo} alt={nome} fill sizes="112px" className="object-contain object-left" />
                </span>
              </span>
            ) : (
              <span className="text-xl font-bold text-white">{nome}</span>
            )}
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-slate-300 transition-colors hover:text-white">
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
                  className="flex size-9 items-center justify-center rounded-full bg-white/10 text-slate-300 transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  <Icone className="size-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 border-t border-white/10 pt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} {nome}. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
