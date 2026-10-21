import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

// Redesign da tela de edição de imóvel — cabeçalho superior (item 4 da
// autorização). "Visualizar" é link NOVO (abre a ficha pública, mesma
// URL canônica já usada pelo Kit de Divulgação); Arquivar/Excluir
// continuam sendo o MESMO GerenciarArquivamentoRegistro de sempre
// (passado pronto, de fora, pra não duplicar a lógica de confirmação/
// permissão); "Salvar alterações" é a MESMA Server Action do formulário
// — nenhum segundo fluxo de persistência.
export function CabecalhoEdicaoImovel({
  acoesArquivamento,
  urlPublica,
  botaoSalvar,
}: {
  acoesArquivamento: ReactNode;
  urlPublica: string | null;
  botaoSalvar: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/app/imoveis"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Voltar para imóveis
          </Link>
          <h1 className="mt-1 min-w-0 break-words text-[28px] leading-tight font-bold tracking-tight">
            Editar imóvel
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Atualize as informações e mantenha o imóvel sempre atualizado.
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {urlPublica && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              nativeButton={false}
              render={<Link href={urlPublica} target="_blank" rel="noopener noreferrer" />}
            >
              <Eye className="size-4" />
              Visualizar
            </Button>
          )}
          {acoesArquivamento}
          {botaoSalvar}
        </div>
      </div>
    </div>
  );
}
