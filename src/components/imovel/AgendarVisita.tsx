"use client";

import { useActionState, useId, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { solicitarVisita } from "@/app/[orgSlug]/actions";
import { CamposAntiSpam } from "@/components/CamposAntiSpam";
import { CamposAtribuicao } from "@/components/CamposAtribuicao";
import { CampoTelefone } from "@/components/CampoTelefone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IconeCalendario } from "@/components/icons";
import { enviarEventoAnalytics } from "@/lib/analytics-client";
import { TIPOS_EVENTO_ANALYTICS } from "@/lib/analytics-eventos";
import { caminhoPoliticaPrivacidade } from "@/lib/politica-privacidade";
import { LIMITE_OBSERVACAO_VISITA } from "@/lib/visita-publica";
import { cn } from "@/lib/utils";

// Agendamento de visita pela ficha (Fase 55).
//
// O botão abre um diálogo — o mesmo componente que o resto do site usa
// (foco preso, Escape fecha, foco volta ao gatilho por construção). O
// formulário fala com a action pública, que põe a visita no MESMO domínio
// das visitas internas; aqui não há regra de negócio nenhuma.
//
// A tela NUNCA promete visita agendada — nem antes, nem depois do envio.
// Desde a Fase 56 isso deixou de ser só uma escolha de texto e passou a
// ser o que o sistema de fato faz: o envio cria uma SOLICITAÇÃO
// (ScheduledActivity REQUESTED), e é o corretor quem a transforma em
// compromisso. O texto daqui é a descrição honesta desse fluxo.

const estadoInicial = { sucesso: false } as Awaited<ReturnType<typeof solicitarVisita>>;

export function AgendarVisita({
  imovelId,
  orgSlug,
  basePath,
  tituloImovel,
  /** Hoje no fuso da organização ("YYYY-MM-DD"): o mínimo do calendário. */
  dataMinima,
}: {
  imovelId: string;
  orgSlug: string;
  basePath: string;
  tituloImovel: string;
  dataMinima: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, formAction, pendente] = useActionState(
    solicitarVisita.bind(null, orgSlug),
    estadoInicial
  );
  const id = useId();
  const campo = (nome: string) => `${id}-${nome}`;
  const primeiroCampo = useRef<HTMLInputElement>(null);

  const erroDoCampo = (nome: string) =>
    estado.campo === nome && estado.erro ? estado.erro : undefined;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(open) => {
        setAberto(open);
        if (open) {
          enviarEventoAnalytics({
            propertyId: imovelId,
            orgSlug,
            type: TIPOS_EVENTO_ANALYTICS.VISIT_FORM_OPEN,
            placement: "SIDEBAR",
          });
        }
      }}
    >
      <DialogTrigger
        data-agendar-visita
        className={cn(
          buttonVariants({ variant: "outline", size: "lg" }),
          "w-full border-primary text-primary hover:bg-primary/5 hover:text-primary"
        )}
      >
        <IconeCalendario className="size-5" aria-hidden="true" />
        Agendar uma visita
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" data-modal-visita>
        <DialogTitle>Agendar uma visita</DialogTitle>
        <DialogDescription className="text-sm text-gray-500">{tituloImovel}</DialogDescription>

        {estado.sucesso ? (
          <div className="space-y-4" data-visita-confirmada>
            <Alert className="border-success-muted-border bg-success-muted text-success-muted-foreground">
              <CheckCircle2 />
              <AlertDescription className="text-success-muted-foreground">
                <strong className="block">Solicitação enviada!</strong>
                O corretor responsável entrará em contato para confirmar o dia e horário.
              </AlertDescription>
            </Alert>
            <Button type="button" className="w-full" onClick={() => setAberto(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <form action={formAction} className="space-y-3">
            {/* O que o envio faz, dito antes de a pessoa preencher: o
                horário é um PEDIDO, não uma reserva. */}
            <p className="text-sm text-gray-500" data-aviso-confirmacao>
              Escolha o melhor dia e horário. O corretor responsável entrará em contato para
              confirmar sua visita.
            </p>
            <CamposAntiSpam />
            <CamposAtribuicao />
            <input type="hidden" name="imovelId" value={imovelId} />

            <div className="space-y-1">
              <Label htmlFor={campo("nome")}>Nome</Label>
              <Input
                id={campo("nome")}
                name="nome"
                ref={primeiroCampo}
                required
                autoComplete="name"
                aria-invalid={erroDoCampo("nome") ? true : undefined}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={campo("telefone")}>Telefone</Label>
                <CampoTelefone
                  id={campo("telefone")}
                  name="telefone"
                  required
                  aria-invalid={erroDoCampo("telefone") ? true : undefined}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={campo("email")}>E-mail</Label>
                <Input
                  id={campo("email")}
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  aria-invalid={erroDoCampo("email") ? true : undefined}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={campo("data")}>Data desejada</Label>
                {/* min = hoje NO FUSO DA ORGANIZAÇÃO, calculado no
                    servidor: o relógio do visitante pode estar em outro
                    fuso, e o servidor recusa passado de qualquer forma. */}
                <Input
                  id={campo("data")}
                  name="data"
                  type="date"
                  required
                  min={dataMinima}
                  aria-invalid={erroDoCampo("data") ? true : undefined}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={campo("hora")}>Horário</Label>
                <Input
                  id={campo("hora")}
                  name="hora"
                  type="time"
                  required
                  aria-invalid={erroDoCampo("hora") ? true : undefined}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor={campo("observacao")}>Observação (opcional)</Label>
              <Textarea
                id={campo("observacao")}
                name="observacao"
                rows={3}
                maxLength={LIMITE_OBSERVACAO_VISITA}
                placeholder="Ex.: prefiro no fim da tarde."
              />
            </div>

            {estado.erro && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}

            {/* disabled enquanto pendente: é o que impede a segunda visita
                criada por duplo clique no mesmo envio. */}
            <Button type="submit" disabled={pendente} className="w-full">
              {pendente ? "Enviando..." : "Solicitar visita"}
            </Button>

            <p className="text-xs text-gray-400">
              Seus dados serão usados apenas para combinar esta visita. Consulte a{" "}
              <Link
                href={caminhoPoliticaPrivacidade(basePath)}
                data-link-politica
                className="text-link underline underline-offset-2 hover:no-underline"
              >
                Política de Privacidade
              </Link>
              .
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
