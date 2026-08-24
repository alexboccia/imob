import { ShieldCheck, Clock } from "lucide-react";
import { auth } from "@/lib/auth";
import { LimparMidiasButton } from "@/components/admin/LimparMidiasButton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default async function ManutencaoPage() {
  const session = await auth();
  // AUTHORIZATION UNCHANGED — mesmo conjunto de papéis já exigido pela
  // Server Action (actions.ts, inalterada nesta tarefa); a UI só evita
  // oferecer uma ação que o servidor recusaria de qualquer forma.
  const podeExecutar =
    session?.user.role === "OWNER" ||
    session?.user.role === "ADMIN" ||
    session?.user.role === "MANAGER";

  return (
    <div className="max-w-2xl space-y-5">
      <div className="min-w-0">
        <h1 className="min-w-0 break-words text-2xl font-semibold">Manutenção</h1>
        <p className="text-sm text-muted-foreground">
          Ferramentas administrativas para limpeza e manutenção da plataforma.
        </p>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Fotos não utilizadas</CardTitle>
          <CardDescription className="min-w-0 break-words">
            Remova arquivos temporários que não estão associados a imóveis
            cadastrados.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-5">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 items-start gap-3 rounded-lg border p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="size-4.5" />
              </div>
              <div className="min-w-0">
                <p className="min-w-0 break-words text-sm font-medium">
                  Proteção automática
                </p>
                <p className="min-w-0 break-words text-xs text-muted-foreground">
                  Somente fotos sem vínculo com imóveis
                </p>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-3 rounded-lg border p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <Clock className="size-4.5" />
              </div>
              <div className="min-w-0">
                <p className="min-w-0 break-words text-sm font-medium">
                  Período de segurança
                </p>
                <p className="min-w-0 break-words text-xs text-muted-foreground">
                  Apenas arquivos enviados há mais de 24 horas
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-1.5 text-sm text-muted-foreground">
            <p className="min-w-0 break-words font-medium text-foreground">
              Como funciona
            </p>
            <ul className="min-w-0 list-disc space-y-1 pl-5">
              <li className="min-w-0 break-words">
                Fotos utilizadas por imóveis cadastrados não são removidas.
              </li>
              <li className="min-w-0 break-words">
                Uploads recentes permanecem protegidos por 24 horas.
              </li>
              <li className="min-w-0 break-words">
                A limpeza remove apenas arquivos considerados não utilizados.
              </li>
            </ul>
          </div>

          {podeExecutar ? (
            <LimparMidiasButton />
          ) : (
            <p className="min-w-0 break-words text-sm text-muted-foreground">
              Apenas administradores ou gestores podem executar essa limpeza.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
