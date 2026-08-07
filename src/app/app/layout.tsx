import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { PAPEL_USUARIO_LABEL } from "@/lib/format";

const NAV_LINKS = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/imoveis", label: "Imóveis" },
  { href: "/app/clientes", label: "Clientes" },
  { href: "/app/caracteristicas", label: "Características" },
  { href: "/app/tipos-imovel", label: "Tipos de imóvel" },
  { href: "/app/usuarios", label: "Usuários" },
  { href: "/app/configuracoes", label: "Configurações" },
  { href: "/app/manutencao", label: "Manutenção" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    return children;
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r bg-gray-50 flex flex-col">
        <div className="px-4 py-4 font-semibold border-b">Painel</div>
        <nav className="flex-1 px-2 py-4 space-y-1 text-sm">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-md px-3 py-2 hover:bg-gray-100"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t text-sm">
          <p className="font-medium truncate">{session.user?.name}</p>
          <p className="text-gray-500 truncate">
            {PAPEL_USUARIO_LABEL[session.user?.role ?? ""] ?? session.user?.role}
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/app/login" });
            }}
          >
            <Button
              type="submit"
              variant="link"
              className="mt-2 h-auto p-0 text-destructive"
            >
              Sair
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex-1">
        <main className="p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
