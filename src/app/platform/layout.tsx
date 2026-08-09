import Link from "next/link";
import { auth, signOut, requirePlatformOperator } from "@/lib/platform/auth";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

const NAV_LINKS = [
  { href: "/platform", label: "Dashboard" },
  { href: "/platform/organizations", label: "Organizations" },
  { href: "/platform/plans", label: "Plans" },
  { href: "/platform/operators", label: "Operators" },
  { href: "/platform/audit", label: "Audit" },
];

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    return children;
  }

  // Defesa em profundidade: o middleware já barra sessão ausente/inválida
  // antes de chegar aqui, mas este layout (e toda page/action de
  // /platform) revalida de novo — nunca confia só no middleware. Redireciona
  // pro login se o operador foi desativado depois do JWT ter sido emitido.
  const operador = await requirePlatformOperator();

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="w-56 border-r border-slate-800 bg-slate-950 text-slate-200 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            EasyMob
          </p>
          <p className="font-semibold text-slate-50">Platform</p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1 text-sm">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-md px-3 py-2 hover:bg-slate-800"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-800 text-sm">
          <p className="font-medium truncate text-slate-50">{session.user?.name}</p>
          <p className="text-slate-500 truncate">{operador.role}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/platform/login" });
            }}
          >
            <Button
              type="submit"
              variant="link"
              className="mt-2 h-auto p-0 text-red-400"
            >
              Sair
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex-1">
        <div className="border-b bg-white px-6 py-3">
          <p className="text-sm font-semibold text-slate-500">Platform Admin</p>
        </div>
        <main className="p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
