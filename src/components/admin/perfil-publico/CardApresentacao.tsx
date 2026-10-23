"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LIMITE_BIO_PUBLICA } from "@/lib/perfil-publico-limites";
import { RodapeSalvarPerfilPublico } from "@/components/admin/perfil-publico/RodapeSalvarPerfilPublico";

// Fase 130 — Card 4: a Apresentação. O rodapé de ações (link "Ver este
// perfil no site" + "Salvar alterações") renderiza AQUI DENTRO por
// padrão (Meu perfil público termina no próprio card). Fase 131 — em
// EditarUsuarioForm o formulário continua depois da Apresentação (Papel,
// status, senha), então ali `rodape={false}` e quem chama renderiza
// `<RodapeSalvarPerfilPublico>` por conta própria, no fim do form.
export function CardApresentacao({
  bio,
  erro,
  perfilPublicoHref,
  mensagem,
  pendente,
  rodape = true,
}: {
  bio: string | null;
  erro?: string[];
  perfilPublicoHref: string | null;
  mensagem: { texto: string; sucesso: boolean } | null;
  pendente: boolean;
  rodape?: boolean;
}) {
  // Contador não-controlado: `onChange` só atualiza a contagem exibida,
  // o `defaultValue`/envio do campo continuam não-controlados (evita o
  // reposicionamento de cursor que um textarea 100% controlado causaria
  // a cada tecla).
  const [tamanho, setTamanho] = useState(bio?.length ?? 0);

  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={FileText}
          titulo="Apresentação"
          descricao="Texto exibido no seu perfil público e nos imóveis."
          tom="azul"
        />

        <div className="space-y-1.5">
          <Label htmlFor="perfilPublicoBio">Apresentação (opcional)</Label>
          <Textarea
            id="perfilPublicoBio"
            name="perfilPublicoBio"
            rows={4}
            maxLength={LIMITE_BIO_PUBLICA}
            defaultValue={bio ?? ""}
            onChange={(e) => setTamanho(e.target.value.length)}
            placeholder="Uma breve apresentação profissional, exibida no site."
            aria-invalid={erro ? true : undefined}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Até {LIMITE_BIO_PUBLICA} caracteres. Texto simples — formatação
              e links não são interpretados.
            </p>
            <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {tamanho}/{LIMITE_BIO_PUBLICA}
            </p>
          </div>
          {erro?.length ? <p className="text-xs text-destructive">{erro[0]}</p> : null}
        </div>

        {rodape && (
          <RodapeSalvarPerfilPublico
            perfilPublicoHref={perfilPublicoHref}
            mensagem={mensagem}
            pendente={pendente}
          />
        )}
      </CardContent>
    </Card>
  );
}
