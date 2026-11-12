import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LOGO_SYNTAKS = "/brand/syntaks-logo.png";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-19 max-w-6xl items-center justify-between gap-6 px-6">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo estático de public/, fora do pipeline de otimização de imagem do next/image */}
          <img src={LOGO_SYNTAKS} alt="syntaks — software de gestão imobiliária" height={34} className="h-[34px] w-auto" />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 sm:flex">
          <Link href="/#funcionalidades" className="hover:text-[var(--syntaks-blue)]">Funcionalidades</Link>
          <Link href="/#site-imobiliario" className="hover:text-[var(--syntaks-blue)]">Site imobiliário</Link>
          <Link href="/planos" className="hover:text-[var(--syntaks-blue)]">Planos</Link>
          <Link href="/#faq" className="hover:text-[var(--syntaks-blue)]">FAQ</Link>
        </nav>
        <Link href="/#demo" className={cn(buttonVariants())}>
          Agendar demonstração
        </Link>
      </div>
    </header>
  );
}
