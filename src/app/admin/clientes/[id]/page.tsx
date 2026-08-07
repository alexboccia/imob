import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  atualizarEstagioFunil,
  registrarInteracao,
} from "@/app/admin/clientes/actions";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ESTAGIOS = [
  "NEW_LEAD",
  "CONTACTED",
  "VISIT_SCHEDULED",
  "PROPOSAL",
  "CLOSED",
  "LOST",
];

const ESTAGIO_LABEL: Record<string, string> = {
  NEW_LEAD: "Novo lead",
  CONTACTED: "Contato feito",
  VISIT_SCHEDULED: "Visita agendada",
  PROPOSAL: "Proposta",
  CLOSED: "Fechado",
  LOST: "Perdido",
};

const TIPO_INTERACAO_LABEL: Record<string, string> = {
  VISIT: "Visita",
  CALL: "Ligação",
  MESSAGE: "Mensagem",
  EMAIL: "E-mail",
  OTHER: "Outro",
};

export default async function DetalheClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizationId = await requireOrganizationId();

  const pessoa = await withOrganization(organizationId, () =>
    prisma.person.findUnique({
      where: { id, organizationId },
      include: {
        interactions: { orderBy: { occurredAt: "desc" }, include: { property: true } },
      },
    })
  );

  if (!pessoa) notFound();

  const atualizarEstagioComId = atualizarEstagioFunil.bind(null, pessoa.id);
  const registrarInteracaoComId = registrarInteracao.bind(null, pessoa.id);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">{pessoa.name}</h1>
      <p className="text-muted-foreground mb-6">
        {pessoa.phone ?? "sem telefone"} · {pessoa.email ?? "sem e-mail"} ·{" "}
        {pessoa.roles.join(", ")}
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Estágio no funil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={atualizarEstagioComId} className="flex gap-2">
            <Select name="estagioFunil" defaultValue={pessoa.pipelineStage}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTAGIOS.map((estagio) => (
                  <SelectItem key={estagio} value={estagio}>
                    {ESTAGIO_LABEL[estagio]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline">
              Atualizar
            </Button>
          </form>
        </CardContent>
      </Card>

      {pessoa.notes && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-line">
              {pessoa.notes}
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Registrar nova interação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={registrarInteracaoComId}
            className="grid grid-cols-1 sm:grid-cols-4 gap-2"
          >
            <Select name="tipo" defaultValue="VISIT">
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_INTERACAO_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input name="notas" placeholder="Notas" className="sm:col-span-2" />
            <Button type="submit">Registrar</Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="font-semibold mb-3">Histórico de interações</h2>
        {pessoa.interactions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma interação registrada.
          </p>
        ) : (
          <ul className="space-y-3">
            {pessoa.interactions.map((interacao) => (
              <li key={interacao.id}>
                <Card>
                  <CardContent className="text-sm">
                    <p className="font-medium flex items-center gap-2">
                      <Badge variant="secondary">
                        {TIPO_INTERACAO_LABEL[interacao.type]}
                      </Badge>
                      {interacao.occurredAt.toLocaleString("pt-BR")}
                    </p>
                    {interacao.property && (
                      <p className="text-muted-foreground mt-1">
                        Imóvel: {interacao.property.title}
                      </p>
                    )}
                    {interacao.notes && (
                      <p className="text-foreground mt-1">{interacao.notes}</p>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
