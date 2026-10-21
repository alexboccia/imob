import type { ReactNode } from "react";
import Link from "next/link";
import { Phone, Mail, MessageCircle, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ESTAGIO_LABEL, ESTAGIO_BADGE_CLASSE, PAPEL_LABEL } from "@/lib/crm-labels";
import { linkWhatsApp } from "@/lib/whatsapp";

// Redesenho da ficha do cliente — cartão horizontal de identificação
// (item 3 da autorização). "Cliente ativo"/"Arquivado" é derivado de
// Person.archivedAt (dado real, não um status inventado: Person não tem
// uma coluna "status", mas TEM arquivamento, e "ativo" é exatamente o
// complemento de "arquivado" nesse modelo). O resto: iniciais em avatar,
// nome, contato (com link de WhatsApp quando o telefone permite), papel
// (PAPEL_LABEL), estágio no funil (ESTAGIO_LABEL/ESTAGIO_BADGE_CLASSE,
// os mesmos do formulário "Estágio no funil") e desde-quando.
export function ClienteCabecalhoIdentificacao({
  nome,
  telefone,
  email,
  roles,
  pipelineStage,
  clienteDesde,
  arquivadoEm,
  posse,
  indicadores,
}: {
  nome: string;
  telefone: string | null;
  email: string | null;
  roles: string[];
  pipelineStage: string;
  clienteDesde: string;
  arquivadoEm: string | null;
  posse: ReactNode;
  indicadores: ReactNode;
}) {
  const inicial = nome.trim().charAt(0).toUpperCase() || "?";
  const urlWhatsApp = linkWhatsApp(telefone);
  const tipo = roles.map((papel) => PAPEL_LABEL[papel] ?? papel).join(", ");

  return (
    // Fase 128.1 — raio e padding maiores que o Card padrão do design
    // system (18-20px/24-28px no protótipo aprovado, contra os ~12px/
    // 16px do Card genérico): só neste cartão, que é o único "hero" da
    // ficha — os demais cards da tela continuam no padrão compartilhado.
    <Card className="min-w-0 rounded-[20px]">
      {/* xl (1280px). Os KPIs têm largura MÍNIMA fixa (560px — 3 tiles
          de ~168px, já que os 3 valores usam o MESMO tamanho de fonte
          dos contadores, pedido explícito, nunca menor só na data), não
          uma porcentagem: um w-45% ficava alguns pixels curto demais em
          1280-1440px e cortava a borda do card (achado real, medido com
          duas larguras percentuais diferentes). shrink-0 garante que o
          bloco de KPIs nunca encolhe abaixo do que cabe; a identificação
          é quem cede espaço (min-w-0, texto já preparado pra quebrar). */}
      <CardContent className="flex flex-col gap-6 p-6 xl:flex-row xl:items-center xl:justify-between xl:gap-8 xl:p-7">
        <div className="flex min-w-0 flex-1 gap-4">
          {/* Azul explícito (não `primary`): o token `primary` deste tema É
              preto/grayscale (usado nos botões de ação), então
              `bg-primary-light`/`text-primary` renderizava um círculo
              cinza com letra preta — a referência mostra azul, mesmo tom
              já usado nos ícones dos KPIs/badge "Novo lead" ao lado. */}
          <Avatar className="size-16 shrink-0 bg-blue-100 text-xl text-blue-700">
            <AvatarFallback className="bg-blue-100 text-xl text-blue-700">
              {inicial}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="min-w-0 break-words text-[28px] leading-tight font-bold tracking-tight">
              {nome}
            </h1>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {telefone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" aria-hidden />
                  {telefone}
                  {urlWhatsApp && (
                    <Link
                      href={urlWhatsApp}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Conversar no WhatsApp"
                      className="text-success-muted-foreground hover:opacity-80"
                    >
                      <MessageCircle className="size-3.5" aria-hidden />
                    </Link>
                  )}
                </span>
              )}
              {email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" aria-hidden />
                  {email}
                </span>
              )}
              {tipo && <span className="uppercase">{tipo}</span>}
            </div>

            <p className="text-xs text-muted-foreground">Cliente desde {clienteDesde}</p>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={arquivadoEm ? "outline" : "secondary"}
                className={arquivadoEm ? "" : "bg-success-muted text-success-muted-foreground"}
              >
                {arquivadoEm ? "Arquivado" : "Cliente ativo"}
              </Badge>
              <Badge className={ESTAGIO_BADGE_CLASSE[pipelineStage]}>
                <BarChart3 className="size-3" aria-hidden />
                {ESTAGIO_LABEL[pipelineStage] ?? pipelineStage}
              </Badge>
              {posse}
            </div>
          </div>
        </div>

        <div className="min-w-0 xl:w-[560px] xl:shrink-0">{indicadores}</div>
      </CardContent>
    </Card>
  );
}
