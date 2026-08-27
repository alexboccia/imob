"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Responsividade do painel administrativo — a sidebar fixa (w-56, sempre
// renderizada) some abaixo de `md` (ver layout.tsx: `hidden md:flex`) e
// este componente assume a navegação nesse intervalo: header compacto
// com botão de menu + Sheet lateral (mesmo componente Sheet já usado em
// NovoUsuarioSheet/ClienteDrawer/etc. — reproduzido com o mesmo lado
// direito de sempre, só a largura máxima muda, em vez de inventar um
// painel à esquerda inédito no projeto). `open` controlado localmente
// pra fechar ao navegar (Link dentro de um layout persistente não
// desmonta o Sheet sozinho — sem o onClick abaixo, o menu ficaria aberto
// por cima da página de destino).
//
// Duplica a lista de links do <aside> desktop (layout.tsx) em vez de
// compartilhar um componente — desktop permanece 100% intocado (zero
// risco), e aqui a lista ganha estado ativo (usePathname), que não foi
// pedido pro desktop.
export function AdminMobileNav({
  navLinks,
  siteUrl,
  userName,
  userRoleLabel,
  logoutAction,
}: {
  navLinks: { href: string; label: string; liberado: boolean }[];
  siteUrl: string | null;
  userName: string | null | undefined;
  userRoleLabel: string;
  logoutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="flex items-center gap-2 border-b bg-gray-50 px-4 py-3 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Abrir menu" />}
        >
          <Menu className="size-5" />
        </SheetTrigger>
        {/* max-w-72: mesmo Sheet de sempre (NovoUsuarioSheet/ClienteDrawer/
            etc.), sempre ancorado à direita nesta base — reproduzido aqui
            de propósito em vez de inventar um painel à esquerda, único
            ajuste é a largura máxima (menu de navegação não precisa dos
            max-w-md/max-w-lg usados pelos formulários). */}
        <SheetContent className="max-w-72">
          <SheetHeader>
            <SheetTitle>Painel</SheetTitle>
          </SheetHeader>
          {siteUrl && (
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 border-b pb-3 text-sm text-gray-600 hover:text-gray-900"
            >
              <ExternalLink className="size-3.5" />
              Ver site
            </a>
          )}
          <nav className="flex-1 space-y-1 overflow-y-auto text-sm" aria-label="Navegação principal">
            {navLinks.map((link) => {
              const ativo = link.href === "/app" ? pathname === "/app" : pathname.startsWith(link.href);
              if (!link.liberado) {
                return (
                  <span
                    key={link.href}
                    title="Disponível em planos superiores"
                    className="flex items-center justify-between rounded-md px-3 py-2 text-gray-400 cursor-not-allowed"
                  >
                    {link.label}
                    <Badge variant="secondary" className="text-[10px]">
                      Pro
                    </Badge>
                  </span>
                );
              }
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={ativo ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={
                    ativo
                      ? "block rounded-md bg-primary/10 px-3 py-2 font-medium text-primary"
                      : "block rounded-md px-3 py-2 hover:bg-gray-100"
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t pt-3 text-sm">
            <p className="min-w-0 truncate font-medium">{userName}</p>
            <p className="min-w-0 truncate text-gray-500">{userRoleLabel}</p>
            <form action={logoutAction}>
              <Button type="submit" variant="link" className="mt-2 h-auto p-0 text-destructive">
                Sair
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
      <span className="font-semibold">Painel</span>
    </header>
  );
}
