import { Inbox } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";
import { ItemContato } from "@/components/admin/NovosContatos";
import type { NovosContatos as Dados } from "@/lib/novos-contatos";
import type { OpcaoResponsavel } from "@/lib/responsavel-negociacao";

// Página própria da caixa de entrada comercial (Fase 118) — não o resumo
// que aparece na Home. `NovosContatos.tsx` continua intocado como widget
// (Card com h3 e badge, pensado para viver ao lado de outros blocos da
// Central); repeti-lo aqui duplicaria o cabeçalho da seção, que
// CabecalhoSecao já dá. Por isso este é um componente novo, local a esta
// página, que reaproveita apenas o que é genuinamente comum: `ItemContato`
// (a mesma leitura e as mesmas ações de cada card) e a mesma leitura de
// dados de `novos-contatos.ts` — nenhuma regra, query ou permissão muda
// aqui.
//
// Existe porque o resumo da Home mostra só os LIMITE_NOVOS_CONTATOS mais
// recentes: quando há mais gente aguardando do que isso, o excedente não
// tinha, antes desta fase, nenhum caminho de volta até a pessoa — só uma
// frase ("e mais N aguardando atendimento") sem link. Esta página é esse
// caminho, no mesmo padrão que `/app/captacoes` já usa para o excedente
// de contatos pendentes de identificação.
export function TodosNovosContatos({
  dados,
  meuMemberId,
  podeAtribuir,
  membros,
}: {
  dados: Dados;
  meuMemberId: string | null;
  podeAtribuir: boolean;
  membros: OpcaoResponsavel[];
}) {
  return (
    <section className="min-w-0 space-y-4">
      <CabecalhoSecao
        icone={Inbox}
        titulo={
          dados.total > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              Novos contatos
              <Badge variant="secondary">
                {dados.total}
                {dados.truncado && "+"}
              </Badge>
            </span>
          ) : (
            "Novos contatos"
          )
        }
        descricao="Chegaram pelo site e ninguém registrou atendimento ainda. Mais recente primeiro."
      />

      <Card className="min-w-0">
        <CardContent>
          {dados.itens.length === 0 ? (
            <EstadoVazio
              icone={Inbox}
              titulo="Nenhum contato aguardando"
              descricao="Quando alguém escrever pelo site e ainda não tiver sido atendido, o contato aparece aqui."
            />
          ) : (
            <ul>
              {dados.itens.map((contato) => (
                <ItemContato
                  key={contato.id}
                  contato={contato}
                  meuMemberId={meuMemberId}
                  podeAtribuir={podeAtribuir}
                  membros={membros}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
