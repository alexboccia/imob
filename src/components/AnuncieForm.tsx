"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Lock } from "lucide-react";
import { enviarAnuncioProprietario } from "@/app/[orgSlug]/actions";
import { CamposAntiSpam } from "@/components/CamposAntiSpam";
import { CamposAtribuicao } from "@/components/CamposAtribuicao";
import { Input } from "@/components/ui/input";
import { CampoTelefone } from "@/components/CampoTelefone";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { caminhoPoliticaPrivacidade } from "@/lib/politica-privacidade";

const estadoInicial = { sucesso: false, erro: undefined as string | undefined };

export function AnuncieForm({ orgSlug, basePath }: { orgSlug: string; basePath: string }) {
  const [estado, formAction, pendente] = useActionState(
    enviarAnuncioProprietario.bind(null, orgSlug),
    estadoInicial
  );

  return (
    <div data-form-anuncie className="min-w-0">
      {estado.sucesso ? (
        <Alert className="border-success-muted-border bg-success-muted text-success-muted-foreground">
          <CheckCircle2 />
          <AlertDescription className="text-success-muted-foreground">
            Recebemos seus dados! Em breve um corretor entrará em contato.
          </AlertDescription>
        </Alert>
      ) : (
        <form action={formAction} className="space-y-4">
          {/* Honeypot + relógio de renderização: a mesma proteção de
              sempre, e é por estarem AQUI, dentro do form, que o
              redesenho não afrouxou nada. */}
          <CamposAntiSpam />
          <CamposAtribuicao />

          <div className="space-y-1.5">
            <Label htmlFor="nome">
              Nome <span className="text-destructive">*</span>
            </Label>
            <Input id="nome" name="nome" placeholder="Seu nome completo" required />
          </div>
          <div className="space-y-1.5">
            {/* E-mail continua OPCIONAL no schema; o formulário não pode
                afirmar o contrário só porque o mockup marcou tudo. */}
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" placeholder="seu@email.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telefone">
              Telefone / WhatsApp <span className="text-destructive">*</span>
            </Label>
            <CampoTelefone
              id="telefone"
              name="telefone"
              placeholder="(11) 99999-9999"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="descricaoImovel">
              Descrição do imóvel <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="descricaoImovel"
              name="descricaoImovel"
              placeholder="Descreva o imóvel (endereço, tipo, valor pretendido, diferenciais...)"
              required
              rows={4}
            />
          </div>

          {estado.erro && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" size="lg" disabled={pendente} className="w-full">
            {pendente ? "Enviando..." : "Quero anunciar meu imóvel →"}
          </Button>

          {/* Mesma rota de política do resto do site (Fase 51): uma só,
              resolvida a partir do basePath do tenant. */}
          <p className="flex items-start justify-center gap-1.5 text-xs text-gray-500">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              Ao enviar, você concorda com nossa{" "}
              <Link
                href={caminhoPoliticaPrivacidade(basePath)}
                data-link-politica
                className="text-link underline underline-offset-2 hover:no-underline"
              >
                Política de Privacidade
              </Link>
              .
            </span>
          </p>
        </form>
      )}
    </div>
  );
}
