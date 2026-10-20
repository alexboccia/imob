import type { ReactNode } from "react";
import { Milestone, StickyNote, History, SlidersHorizontal, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";
import { EditarClienteDialog } from "@/components/admin/EditarClienteDialog";
import { LinkIrParaAba } from "@/components/admin/cliente/BotaoIrParaAba";

// Redesenho da ficha do cliente — aba "Visão geral" (item 7 da
// autorização), grade de 2 colunas em desktop / 1 em mobile. As 3 linhas
// da referência: (1) Informações do cliente / Estágio no funil,
// (2) Próxima ação / Observações + Última interação, (3) resumo de
// Preferências / preview de Imóveis recomendados.
//
// Componente puramente de composição — todo dado já chega resolvido da
// página (Server Component): nenhuma query aqui, nenhuma regra nova.
export function ClienteVisaoGeral({
  pessoaId,
  telefone,
  email,
  roles,
  clienteDesde,
  estagioFunilForm,
  proximaAcao,
  observacoes,
  valoresEdicao,
  ultimaInteracao,
  preferenciasResumo,
  recomendacoesPreview,
  totalRecomendados,
}: {
  pessoaId: string;
  telefone: string | null;
  email: string | null;
  roles: string[];
  clienteDesde: string;
  estagioFunilForm: ReactNode;
  proximaAcao: ReactNode;
  observacoes: string | null;
  valoresEdicao: { nome: string; email: string | null; telefone: string | null; observacoes: string | null };
  ultimaInteracao: ReactNode;
  preferenciasResumo: ReactNode;
  recomendacoesPreview: ReactNode;
  totalRecomendados: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="space-y-3">
        <CabecalhoSecao titulo="Informações do cliente" />
        <Card className="min-w-0">
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Telefone: </span>
              {telefone ?? "sem telefone"}
            </p>
            <p>
              <span className="text-muted-foreground">E-mail: </span>
              {email ?? "sem e-mail"}
            </p>
            <p className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">Papel: </span>
              {roles.map((papel) => (
                <Badge key={papel} variant="secondary">
                  {papel}
                </Badge>
              ))}
            </p>
            <p className="text-muted-foreground">Cliente desde {clienteDesde}</p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <CabecalhoSecao
          icone={Milestone}
          titulo="Estágio no funil"
          descricao="Estágio geral deste cliente — diferente do estágio de cada negociação, na aba Imóveis."
        />
        <Card className="min-w-0">
          <CardContent>{estagioFunilForm}</CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <CabecalhoSecao icone={Building2} titulo="Próxima ação" />
        <Card className="min-w-0">
          <CardContent>{proximaAcao}</CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <CabecalhoSecao
          icone={StickyNote}
          titulo="Observações"
          acoes={
            <EditarClienteDialog
              personId={pessoaId}
              valoresIniciais={valoresEdicao}
              variante="icone"
            />
          }
        />
        <Card className="min-w-0">
          <CardContent className="text-sm">
            {observacoes ? (
              <p className="whitespace-pre-line text-foreground">{observacoes}</p>
            ) : (
              <p className="text-muted-foreground">Nenhuma observação registrada.</p>
            )}
          </CardContent>
        </Card>

        <CabecalhoSecao
          icone={History}
          titulo="Última interação"
          acoes={<LinkIrParaAba aba="historico">Ver histórico</LinkIrParaAba>}
        />
        <Card className="min-w-0">
          <CardContent className="text-sm">
            {ultimaInteracao ?? (
              <p className="text-muted-foreground">Nenhuma interação registrada ainda.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <CabecalhoSecao
          icone={SlidersHorizontal}
          titulo="Preferências de imóvel (resumo)"
          acoes={<LinkIrParaAba aba="preferencias">Ver todas</LinkIrParaAba>}
        />
        <Card className="min-w-0">
          <CardContent>{preferenciasResumo}</CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <CabecalhoSecao
          icone={Building2}
          titulo="Imóveis recomendados"
          acoes={<LinkIrParaAba aba="imoveis">Ver todos ({totalRecomendados})</LinkIrParaAba>}
        />
        {recomendacoesPreview ?? (
          <EstadoVazio
            icone={Building2}
            titulo="Nenhuma recomendação ainda"
            descricao="Cadastre as preferências deste cliente para ver recomendações aqui."
          />
        )}
      </section>
    </div>
  );
}
