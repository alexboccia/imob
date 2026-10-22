"use client";

import { useState } from "react";
import { ExternalLink, FileText, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LIMITE_BIO_PUBLICA } from "@/lib/perfil-publico-limites";

// Fase 130 — Card 4: a Apresentação, mais o rodapé de ações (link
// "Ver este perfil no site" + "Salvar alterações", o único botão de
// salvar da tela — nenhum segundo fluxo de persistência).
export function CardApresentacao({
  bio,
  erro,
  perfilPublicoHref,
  mensagem,
  pendente,
}: {
  bio: string | null;
  erro?: string[];
  perfilPublicoHref: string | null;
  mensagem: { texto: string; sucesso: boolean } | null;
  pendente: boolean;
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

        {mensagem && (
          <Alert variant={mensagem.sucesso ? "default" : "destructive"}>
            <AlertDescription>{mensagem.texto}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          {perfilPublicoHref ? (
            <p className="text-xs">
              <a
                href={perfilPublicoHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-link hover:underline"
                data-testid="ver-perfil-publico"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                Ver este perfil no site
              </a>{" "}
              <span className="text-muted-foreground">
                — abre a página pública real, como o visitante a vê.
              </span>
            </p>
          ) : (
            <span />
          )}

          <Button
            type="submit"
            disabled={pendente}
            className="gap-1.5 bg-blue-600 font-semibold text-white hover:bg-blue-700"
          >
            <Save className="size-4" />
            {pendente ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
