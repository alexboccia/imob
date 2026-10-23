import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErroCampo } from "@/components/admin/ErroCampo";

// Fase 131 — Card 2 de "Editar usuário": contatos OPERACIONAIS (uso
// interno da equipe) — nunca publicados no site. Os contatos PÚBLICOS
// (destinados ao site) vivem no card "Perfil público", mais abaixo.
export function CardContatoOperacional({
  whatsapp,
  emailContato,
  erros,
}: {
  whatsapp: string | null;
  emailContato: string | null;
  erros?: Record<string, string[] | undefined>;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={Building2}
          titulo="Contato operacional"
          descricao="Uso interno da equipe — nunca aparece no site público."
          tom="azul"
        />

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp operacional (opcional)</Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              className="h-10"
              defaultValue={whatsapp ?? ""}
              placeholder="5511999998888 (DDI + DDD + número, só dígitos)"
              aria-invalid={erros?.whatsapp ? true : undefined}
            />
            <p className="text-xs text-muted-foreground">
              Uso interno da equipe. Não é publicado no site — para isso há o
              WhatsApp público, na seção Perfil público abaixo.
            </p>
            <ErroCampo erros={erros?.whatsapp} />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="emailContato">E-mail de contato (opcional)</Label>
            <Input
              id="emailContato"
              name="emailContato"
              type="email"
              className="h-10"
              defaultValue={emailContato ?? ""}
              placeholder="corretor@suaimobiliaria.com.br"
              aria-invalid={erros?.emailContato ? true : undefined}
            />
            <p className="text-xs text-muted-foreground">
              Para onde vão as mensagens do formulário de contato dos imóveis
              deste corretor. Se vazio, usa o e-mail configurado em
              Configurações.
            </p>
            <ErroCampo erros={erros?.emailContato} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
