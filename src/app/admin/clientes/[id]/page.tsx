import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  atualizarEstagioFunil,
  registrarInteracao,
} from "@/app/admin/clientes/actions";
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
  "NOVO_LEAD",
  "CONTATO_FEITO",
  "VISITA_AGENDADA",
  "PROPOSTA",
  "FECHADO",
  "PERDIDO",
];

const ESTAGIO_LABEL: Record<string, string> = {
  NOVO_LEAD: "Novo lead",
  CONTATO_FEITO: "Contato feito",
  VISITA_AGENDADA: "Visita agendada",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

const TIPO_INTERACAO_LABEL: Record<string, string> = {
  VISITA: "Visita",
  LIGACAO: "Ligação",
  MENSAGEM: "Mensagem",
  EMAIL: "E-mail",
  OUTRO: "Outro",
};

export default async function DetalheClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const pessoa = await prisma.pessoa.findUnique({
    where: { id },
    include: {
      interacoes: { orderBy: { dataHora: "desc" }, include: { imovel: true } },
    },
  });

  if (!pessoa) notFound();

  const atualizarEstagioComId = atualizarEstagioFunil.bind(null, pessoa.id);
  const registrarInteracaoComId = registrarInteracao.bind(null, pessoa.id);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">{pessoa.nome}</h1>
      <p className="text-muted-foreground mb-6">
        {pessoa.telefone ?? "sem telefone"} · {pessoa.email ?? "sem e-mail"} ·{" "}
        {pessoa.papeis.join(", ")}
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Estágio no funil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={atualizarEstagioComId} className="flex gap-2">
            <Select name="estagioFunil" defaultValue={pessoa.estagioFunil}>
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

      {pessoa.observacoes && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-line">
              {pessoa.observacoes}
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
            <Select name="tipo" defaultValue="VISITA">
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
        {pessoa.interacoes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma interação registrada.
          </p>
        ) : (
          <ul className="space-y-3">
            {pessoa.interacoes.map((interacao) => (
              <li key={interacao.id}>
                <Card>
                  <CardContent className="text-sm">
                    <p className="font-medium flex items-center gap-2">
                      <Badge variant="secondary">
                        {TIPO_INTERACAO_LABEL[interacao.tipo]}
                      </Badge>
                      {interacao.dataHora.toLocaleString("pt-BR")}
                    </p>
                    {interacao.imovel && (
                      <p className="text-muted-foreground mt-1">
                        Imóvel: {interacao.imovel.titulo}
                      </p>
                    )}
                    {interacao.notas && (
                      <p className="text-foreground mt-1">{interacao.notas}</p>
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
