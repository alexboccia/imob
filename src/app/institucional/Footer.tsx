import Link from "next/link";
import { MessageCircle } from "lucide-react";

const LOGO_SYNTAKS = "/brand/syntaks-logo.png";

// Mesmo número documentado em docs/comercial/05-perguntas-frequentes.md e
// usado como contato oficial do produto (WhatsApp comum, seg-sex 9h-18h,
// horário de Brasília) — não confundir com o WhatsApp comercial de cada
// imobiliária cliente, que é configurado por organização.
const WHATSAPP_SYNTAKS = "5511976069213";

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
            <p className="font-bold">Fale com a gente</p>
            <a
              href={`https://wa.me/${WHATSAPP_SYNTAKS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-slate-600 hover:text-[var(--syntaks-blue)]"
            >
              <MessageCircle className="size-4" aria-hidden />
              (11) 97606-9213
            </a>
            <p className="text-xs text-slate-400">Seg a sex, 9h às 18h</p>
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
