import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function ModuloBloqueado({
  titulo,
  descricao,
}: {
  titulo: string;
  descricao: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {descricao} Disponível em planos superiores — fale com a gente para
        fazer upgrade.
      </CardContent>
    </Card>
  );
}
