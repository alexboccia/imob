import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

const NAV_LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/imoveis", label: "Imóveis" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/caracteristicas", label: "Características" },
  { href: "/admin/configuracoes", label: "Configurações" },
  { href: "/admin/manutencao", label: "Manutenção" },
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
          <p className="text-gray-500 truncate">{session.user?.papel}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/admin/login" });
            }}
          >
            <button type="submit" className="mt-2 text-red-600 hover:underline">
              Sair
            </button>
          </form>
        </div>
      </aside>
      <div className="flex-1">
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
