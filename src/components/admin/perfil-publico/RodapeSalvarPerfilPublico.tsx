import { ExternalLink, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Fase 130 — rodapé de ações do formulário de perfil público: link
// "Ver este perfil no site" + "Salvar alterações" (único botão de
// salvar da tela, nenhum segundo fluxo de persistência). Fase 131
// extraiu este bloco de dentro do Card de Apresentação pra também servir
// `EditarUsuarioForm` (gestão de usuários), cujo formulário continua
// depois da Apresentação (Papel, status, senha) — lá o rodapé é o
// último elemento do form, não um filho do card.
export function RodapeSalvarPerfilPublico({
  perfilPublicoHref,
  mensagem,
  pendente,
}: {
  perfilPublicoHref: string | null;
  mensagem: { texto: string; sucesso: boolean } | null;
  pendente: boolean;
}) {
  return (
    <div className="space-y-4">
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
    </div>
  );
}
