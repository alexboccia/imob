import { Info, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { Switch } from "@/components/ui/switch";

// Fase 130 — Card 1 de "Meu perfil público": a DECISÃO de publicar.
// Mesmo contrato de sempre com a action (`name="perfilPublicoAtivo"`,
// submete "on" quando ligado) — só o controle visual mudou de checkbox
// para switch (Base UI Switch submete o mesmo "on"/nada que um checkbox
// nativo, então nenhuma mudança na action nem no schema).
export function CardPerfilPublico({ publicado }: { publicado: boolean }) {
  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={UserRound}
          titulo="Perfil público"
          descricao="Identidade comercial exibida no site público e nos imóveis em que você é o responsável."
          tom="azul"
        />

        {/* Bloco informativo — mesmas regras de privacidade do texto
            anterior (PerfilPublicoCorretorFields), só reorganizadas em
            um único bloco visual com ícone, em vez de dois parágrafos
            soltos. Nenhuma regra foi omitida. */}
        <div className="flex gap-2.5 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
          <Info className="mt-0.5 size-4 shrink-0 text-blue-500" aria-hidden />
          <div className="space-y-1.5">
            <p>
              Essas informações aparecem na página do profissional no site da
              imobiliária e nos imóveis em que você é o responsável. Nada
              aqui aparece no site enquanto a exibição não for marcada
              abaixo — e os dados internos do painel (e-mail de acesso,
              WhatsApp e e-mail operacionais) nunca são publicados.
            </p>
            <p>
              Os contatos abaixo são separados dos operacionais: preencher
              um deles significa publicá-lo no site. Deixar em branco é não
              ter aquele contato público — e o botão correspondente deixa
              de existir.
            </p>
          </div>
        </div>

        <label
          className="flex items-start justify-between gap-3"
          data-testid="perfil-publico-ativo"
        >
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">
              Exibir este profissional no site público
            </span>
            <span className="block text-xs text-muted-foreground">
              Ao desmarcar, o site volta a mostrar apenas os dados da
              imobiliária. As informações preenchidas abaixo continuam
              salvas.
            </span>
          </span>
          <Switch name="perfilPublicoAtivo" defaultChecked={publicado} className="mt-0.5 shrink-0" />
        </label>
      </CardContent>
    </Card>
  );
}
