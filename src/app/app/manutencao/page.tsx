import { auth } from "@/lib/auth";
import { LimparMidiasButton } from "@/components/admin/LimparMidiasButton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function ManutencaoPage() {
  const session = await auth();
  const podeExecutar =
    session?.user.role === "OWNER" ||
    session?.user.role === "ADMIN" ||
    session?.user.role === "MANAGER";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Manutenção</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fotos não utilizadas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Remove do armazenamento (Cloudflare R2) fotos que foram enviadas
            durante o cadastro de um imóvel, mas nunca chegaram a ser salvas
            (ex: o formulário foi fechado antes de clicar em &quot;Salvar
            imóvel&quot;). Só remove arquivos com mais de 24 horas, para não
            afetar cadastros em andamento.
          </p>
        </CardHeader>
        <CardContent>
          {podeExecutar ? (
            <LimparMidiasButton />
          ) : (
            <p className="text-sm text-muted-foreground">
              Apenas administradores ou gestores podem executar essa limpeza.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
