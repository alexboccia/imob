import { Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Fase 130 — Card 3 de "Meu perfil público": CRECI, WhatsApp, telefone e
// e-mail públicos. Mesmos ids/names/valores/textos de ajuda de sempre —
// só o agrupamento visual muda (2 colunas em vez de empilhado/fieldset).
export function CardContatosPublicos({
  valores,
  erros,
}: {
  valores: {
    creci: string | null;
    whatsapp: string | null;
    telefone: string | null;
    email: string | null;
  };
  erros?: Record<string, string[] | undefined>;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={Phone}
          titulo="Informações de contato"
          descricao="Estes dados podem ser exibidos no site público, conforme preenchimento."
          tom="azul"
        />

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="perfilPublicoCreci">CRECI (opcional)</Label>
            <Input
              id="perfilPublicoCreci"
              name="perfilPublicoCreci"
              className="h-10"
              defaultValue={valores.creci ?? ""}
              placeholder="Ex: CRECI 00.000-F"
              aria-invalid={erros?.perfilPublicoCreci ? true : undefined}
            />
            <ErroCampo erros={erros?.perfilPublicoCreci} />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="perfilPublicoWhatsapp">WhatsApp público (opcional)</Label>
            <Input
              id="perfilPublicoWhatsapp"
              name="perfilPublicoWhatsapp"
              className="h-10"
              defaultValue={valores.whatsapp ?? ""}
              placeholder="5511999998888 (DDI + DDD + número, só dígitos)"
              aria-invalid={erros?.perfilPublicoWhatsapp ? true : undefined}
            />
            <p className="text-xs text-muted-foreground">
              Número exibido no site. É separado do WhatsApp operacional
              acima, que nunca é publicado. Se vazio, os botões de WhatsApp
              dos imóveis usam o número da imobiliária (Configurações).
            </p>
            <ErroCampo erros={erros?.perfilPublicoWhatsapp} />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="perfilPublicoTelefone">Telefone público (opcional)</Label>
            <Input
              id="perfilPublicoTelefone"
              name="perfilPublicoTelefone"
              className="h-10"
              defaultValue={valores.telefone ?? ""}
              placeholder="(11) 99999-9999"
              aria-describedby="perfilPublicoTelefone-ajuda"
              aria-invalid={erros?.perfilPublicoTelefone ? true : undefined}
            />
            <p id="perfilPublicoTelefone-ajuda" className="text-xs text-muted-foreground">
              Número para ligação, exibido no site. DDD + número. É separado
              do WhatsApp acima e do telefone da imobiliária.
            </p>
            <ErroCampo erros={erros?.perfilPublicoTelefone} />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="perfilPublicoEmail">E-mail público (opcional)</Label>
            <Input
              id="perfilPublicoEmail"
              name="perfilPublicoEmail"
              type="email"
              className="h-10"
              defaultValue={valores.email ?? ""}
              placeholder="nome@imobiliaria.com.br"
              aria-describedby="perfilPublicoEmail-ajuda"
              aria-invalid={erros?.perfilPublicoEmail ? true : undefined}
            />
            <p id="perfilPublicoEmail-ajuda" className="text-xs text-muted-foreground">
              Endereço exibido no site. Nunca é o e-mail de acesso ao
              painel, que continua privado.
            </p>
            <ErroCampo erros={erros?.perfilPublicoEmail} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ErroCampo({ erros }: { erros?: string[] }) {
  if (!erros?.length) return null;
  return <p className="text-xs text-destructive">{erros[0]}</p>;
}
