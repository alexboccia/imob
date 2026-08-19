"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ESTAGIO_LABEL,
  ESTAGIO_BADGE_CLASSE,
  ORIGEM_LABEL,
  PAPEL_LABEL,
  TIPO_INTERACAO_LABEL,
} from "@/lib/crm-labels";
import { buscarResumoClienteCrm, type ResumoClienteDrawer } from "@/app/app/clientes/actions";
import type { ClienteRow } from "@/app/app/clientes/columns";
import { MessageCircle, Phone, Mail, CalendarPlus, Heart, Eye, FileText, ListChecks } from "lucide-react";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

// Redesenho da tela de Clientes — drawer lateral aberto ao clicar numa
// linha da listagem. Mostra IMEDIATAMENTE os dados que a linha já tinha
// (interesse/próxima ação/último contato — mesmos dados batched em
// page.tsx, zero fetch extra pra isso) e busca sob demanda só o que a
// linha não carrega (contagens de resumo + histórico de interações),
// via buscarResumoClienteCrm — uma chamada por abertura de drawer, nunca
// por linha da listagem.
export function ClienteDrawer({
  cliente,
  open,
  onOpenChange,
}: {
  cliente: ClienteRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [resumo, setResumo] = useState<ResumoClienteDrawer | null>(null);

  useEffect(() => {
    if (!open || !cliente) return;
    let cancelado = false;
    buscarResumoClienteCrm(cliente.id).then((r) => {
      if (!cancelado) setResumo(r);
    });
    return () => {
      cancelado = true;
    };
  }, [open, cliente]);

  if (!cliente) return null;

  // `resumo` guardado em state pode ser de um cliente anterior por uma
  // fração de segundo (fechou o drawer e abriu outro antes do fetch
  // resolver) — nunca renderiza contagens/histórico de OUTRO cliente,
  // mesmo que o id já tenha mudado (derivado no render, não resetado via
  // setState num efeito, ver react-hooks/set-state-in-effect). "Carregando"
  // também é derivado (não é state próprio): drawer aberto + ainda sem
  // resumo do cliente atual = carregando, sem precisar de uma segunda
  // variável pra manter sincronizada com esta.
  const resumoAtual = resumo?.id === cliente.id ? resumo : null;
  const carregando = !resumoAtual;

  const whatsappHref = cliente.telefone
    ? `https://wa.me/${cliente.telefone.replace(/\D/g, "")}`
    : null;
  const telefoneHref = cliente.telefone ? `tel:+${cliente.telefone.replace(/\D/g, "")}` : null;
  const emailHref = cliente.email ? `mailto:${cliente.email}` : null;

  const papelPrincipal = resumoAtual?.roles[resumoAtual.roles.length - 1] ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-md">
        <SheetHeader>
          <div className="flex items-start gap-3">
            <Avatar className="size-12">
              <AvatarFallback className="text-sm">{iniciais(cliente.nome)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <SheetTitle>{cliente.nome}</SheetTitle>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge className={ESTAGIO_BADGE_CLASSE[cliente.estagio] ?? ""} variant="outline">
                  {ESTAGIO_LABEL[cliente.estagio] ?? cliente.estagio}
                </Badge>
                {papelPrincipal && <Badge variant="secondary">{PAPEL_LABEL[papelPrincipal] ?? papelPrincipal}</Badge>}
                {resumoAtual?.source && (
                  <span className="text-xs text-muted-foreground">{ORIGEM_LABEL[resumoAtual.source] ?? resumoAtual.source}</span>
                )}
              </div>
            </div>
          </div>
          <SheetDescription className="sr-only">Detalhes do cliente {cliente.nome}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto">
          {/* Ações rápidas — só ações com dado real por trás */}
          <div className="grid grid-cols-4 gap-2">
            <a
              href={whatsappHref ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!whatsappHref}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs ${whatsappHref ? "hover:bg-muted" : "pointer-events-none opacity-40"}`}
            >
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
            <a
              href={telefoneHref ?? undefined}
              aria-disabled={!telefoneHref}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs ${telefoneHref ? "hover:bg-muted" : "pointer-events-none opacity-40"}`}
            >
              <Phone className="size-4" />
              Ligar
            </a>
            <a
              href={emailHref ?? undefined}
              aria-disabled={!emailHref}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs ${emailHref ? "hover:bg-muted" : "pointer-events-none opacity-40"}`}
            >
              <Mail className="size-4" />
              E-mail
            </a>
            {/* Agenda ainda não aceita um cliente pré-selecionado via URL
                (src/app/app/agenda/page.tsx não lê personId de searchParams)
                — link genérico pra agenda, nunca um link "Agendar" que na
                verdade só abre a ficha do cliente. */}
            <Link
              href="/app/agenda"
              className="flex flex-col items-center gap-1 rounded-lg border p-2 text-xs hover:bg-muted"
            >
              <CalendarPlus className="size-4" />
              Agendar
            </Link>
          </div>

          {/* Interesse — mesmo dado já mostrado na linha, sem novo fetch */}
          <div>
            <h3 className="mb-1.5 text-sm font-medium">Interesse</h3>
            {cliente.interesseLinhas ? (
              <div className="space-y-0.5 text-sm">
                {cliente.interesseLinhas.map((linha, i) => (
                  <p key={i} className={i === 0 ? "font-medium" : "text-muted-foreground"}>
                    {linha}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Interesse não informado</p>
            )}
          </div>

          {/* Próxima ação — card de destaque */}
          {cliente.proximaAcao && (
            <Card size="sm" className="border-primary/30 bg-primary/5">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{cliente.proximaAcao.texto}</p>
                  {cliente.proximaAcao.dataTexto && (
                    <p className="text-xs text-muted-foreground">{cliente.proximaAcao.dataTexto}</p>
                  )}
                </div>
                <Badge variant="secondary">Pendente</Badge>
              </CardContent>
            </Card>
          )}

          {/* Resumo rápido — só as contagens que vieram do resumo carregado;
              nada é mostrado (nem zerado) antes de carregar, pra nunca
              piscar "0" como se fosse um dado real. */}
          {resumoAtual && (
            <div>
              <h3 className="mb-1.5 text-sm font-medium">Resumo rápido</h3>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg border p-2">
                  <Heart className="mx-auto size-3.5 text-destructive" />
                  <p className="mt-1 text-sm font-semibold">{resumoAtual.contagens.favoritos}</p>
                  <p className="text-[10px] text-muted-foreground">Favoritos</p>
                </div>
                <div className="rounded-lg border p-2">
                  <Eye className="mx-auto size-3.5 text-primary" />
                  <p className="mt-1 text-sm font-semibold">{resumoAtual.contagens.visitados}</p>
                  <p className="text-[10px] text-muted-foreground">Visitados</p>
                </div>
                <div className="rounded-lg border p-2">
                  <FileText className="mx-auto size-3.5 text-amber-600" />
                  <p className="mt-1 text-sm font-semibold">{resumoAtual.contagens.propostas}</p>
                  <p className="text-[10px] text-muted-foreground">Propostas</p>
                </div>
                <div className="rounded-lg border p-2">
                  <ListChecks className="mx-auto size-3.5 text-violet-600" />
                  <p className="mt-1 text-sm font-semibold">{resumoAtual.contagens.atividades}</p>
                  <p className="text-[10px] text-muted-foreground">Atividades</p>
                </div>
              </div>
            </div>
          )}

          {/* Histórico */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-sm font-medium">Histórico</h3>
              <Link href={`/app/clientes/${cliente.id}`} className="text-xs text-primary hover:underline">
                Ver tudo
              </Link>
            </div>
            {carregando && <p className="text-xs text-muted-foreground">Carregando...</p>}
            {!carregando && resumoAtual && resumoAtual.interacoes.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma interação registrada.</p>
            )}
            {!carregando && resumoAtual && resumoAtual.interacoes.length > 0 && (
              <ul className="space-y-2.5">
                {resumoAtual.interacoes.map((interacao) => (
                  <li key={interacao.id} className="border-l-2 border-muted pl-3 text-xs">
                    <p className="font-medium text-foreground">
                      {TIPO_INTERACAO_LABEL[interacao.type] ?? interacao.type}
                      {interacao.propertyTitulo && ` · ${interacao.propertyTitulo}`}
                    </p>
                    <p className="text-muted-foreground">
                      {interacao.occurredAt.toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {interacao.notes && <p className="mt-0.5 text-muted-foreground">{interacao.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <Button
          render={<Link href={`/app/clientes/${cliente.id}`} />}
          nativeButton={false}
          className="w-full"
        >
          Ver perfil completo
        </Button>
      </SheetContent>
    </Sheet>
  );
}
