import { requirePlatformOperator } from "@/lib/platform/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CriarOperatorForm } from "./CriarOperatorForm";
import { alternarAtivoOperator } from "./actions";

export default async function PlatformOperatorsPage() {
  const operadorAtual = await requirePlatformOperator();

  const operadores = await prisma.platformOperator.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Operators</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipe EasyMob</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {operadores.map((op) => {
              const ehVoceMesmo = op.id === operadorAtual.id;
              return (
                <div
                  key={op.id}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {op.name} {ehVoceMesmo && <span className="text-muted-foreground">(você)</span>}
                    </p>
                    <p className="text-muted-foreground">{op.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{op.role}</Badge>
                    {op.active ? (
                      <Badge className="bg-green-600 text-white">Ativo</Badge>
                    ) : (
                      <Badge variant="destructive">Inativo</Badge>
                    )}
                    {!ehVoceMesmo && (
                      <form
                        action={async () => {
                          "use server";
                          await alternarAtivoOperator(op.id);
                        }}
                      >
                        <Button
                          type="submit"
                          size="sm"
                          variant={op.active ? "destructive" : "outline"}
                        >
                          {op.active ? "Desativar" : "Ativar"}
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo operador</CardTitle>
        </CardHeader>
        <CardContent>
          <CriarOperatorForm />
        </CardContent>
      </Card>
    </div>
  );
}
