"use client";

import Link from "next/link";
import type { DataTableColumn } from "@/components/admin/data-table/DataTable";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ESTAGIO_LABEL, ESTAGIO_BADGE_CLASSE, TIPO_INTERACAO_LABEL } from "@/lib/crm-labels";
import { MoreHorizontal, Calendar } from "lucide-react";

// Redesenho da tela de Clientes — ESTAGIO_LABEL (PipelineStage) foi
// consolidado em src/lib/crm-labels.ts (antes duplicado aqui e em
// [id]/page.tsx). Reexportado por compatibilidade — page.tsx e
// ClientesFiltrosEstagio importam de crm-labels.ts diretamente agora, mas
// não custa nada manter aqui também caso algo externo ainda importe
// daqui.
export { ESTAGIO_LABEL };

export type ClienteRow = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  estagio: string;
  interesseLinhas: string[] | null;
  ultimoContato: { texto: string; tipoLabel: string } | null;
  proximaAcao: { texto: string; dataTexto: string | null } | null;
  corretorNome: string | null;
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

function CelulaCopiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <DropdownMenuItem
      onClick={(e) => {
        e.preventDefault();
        navigator.clipboard.writeText(valor).catch(() => {});
      }}
    >
      Copiar {rotulo}
    </DropdownMenuItem>
  );
}

export const clienteColumns: DataTableColumn<ClienteRow>[] = [
  {
    accessorKey: "nome",
    header: "Cliente",
    cell: ({ row }) => {
      const cliente = row.original;
      return (
        <div className="flex items-center gap-2.5 min-w-48">
          <Avatar className="size-9">
            <AvatarFallback>{iniciais(cliente.nome)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <Link
              href={`/app/clientes/${cliente.id}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium hover:underline"
            >
              {cliente.nome}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {cliente.telefone ?? cliente.email ?? "Sem contato cadastrado"}
            </p>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "interesseLinhas",
    header: "Interesse",
    cell: ({ row }) => {
      const linhas = row.original.interesseLinhas;
      if (!linhas) return <span className="text-xs text-muted-foreground">Interesse não informado</span>;
      return (
        <div className="text-xs leading-relaxed">
          {linhas.map((linha, i) => (
            <p key={i} className={i === 0 ? "font-medium text-foreground" : "text-muted-foreground"}>
              {linha}
            </p>
          ))}
        </div>
      );
    },
  },
  {
    accessorKey: "estagio",
    header: "Estágio",
    cell: ({ row }) => {
      const estagio = row.original.estagio;
      return (
        <Badge className={ESTAGIO_BADGE_CLASSE[estagio] ?? ""} variant="outline">
          {ESTAGIO_LABEL[estagio] ?? estagio}
        </Badge>
      );
    },
  },
  {
    accessorKey: "ultimoContato",
    header: "Último contato",
    cell: ({ row }) => {
      const contato = row.original.ultimoContato;
      if (!contato) return <span className="text-xs text-muted-foreground">Nenhum contato registrado</span>;
      return (
        <div className="text-xs">
          <p>{contato.texto}</p>
          <p className="text-muted-foreground">{TIPO_INTERACAO_LABEL[contato.tipoLabel] ?? contato.tipoLabel}</p>
        </div>
      );
    },
  },
  {
    accessorKey: "proximaAcao",
    header: "Próxima ação",
    cell: ({ row }) => {
      const acao = row.original.proximaAcao;
      if (!acao) return <span className="text-xs text-muted-foreground">Sem próxima ação</span>;
      return (
        <div className="flex items-center gap-1.5 text-xs">
          <Calendar className="size-3.5 text-primary shrink-0" />
          <div>
            <p className="font-medium text-foreground">{acao.texto}</p>
            {acao.dataTexto && <p className="text-muted-foreground">{acao.dataTexto}</p>}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "corretorNome",
    header: "Corretor",
    cell: ({ row }) => (
      <span className="text-sm">{row.original.corretorNome ?? "Não atribuído"}</span>
    ),
  },
  {
    id: "acoes",
    header: "",
    cell: ({ row }) => {
      const cliente = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" onClick={(e) => e.stopPropagation()} />}
          >
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Ações</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem render={<Link href={`/app/clientes/${cliente.id}`} />}>
              Ver perfil completo
            </DropdownMenuItem>
            {cliente.telefone && <CelulaCopiar valor={cliente.telefone} rotulo="telefone" />}
            {cliente.email && <CelulaCopiar valor={cliente.email} rotulo="e-mail" />}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
