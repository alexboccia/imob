import Link from "next/link";

const LOGO_SYNTAKS = "/brand/syntaks-logo.png";

export function Footer() {
  return (
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
            <Link href="/#funcionalidades" className="block text-slate-600 hover:text-[var(--syntaks-blue)]">Funcionalidades</Link>
            <Link href="/#site-imobiliario" className="block text-slate-600 hover:text-[var(--syntaks-blue)]">Site imobiliário</Link>
            <Link href="/planos" className="block text-slate-600 hover:text-[var(--syntaks-blue)]">Planos</Link>
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
  );
}
