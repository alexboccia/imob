"use client";

import { useId } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

// Botão de upload com aparência de painel (Fase 63).
//
// O logotipo e o favicon usavam o <input type="file"> cru, com o
// pseudo-elemento ::file-selector-button estilizado — o que o navegador
// desenha ao lado dele ("Nenhum arquivo escolhido") não é estilizável, e
// era isso que deixava a tela com cara de formulário nativo.
//
// A SOLUÇÃO NÃO ESCONDE O CONTROLE. O input continua no DOM, focável e
// anunciado: `sr-only` o remove visualmente mas o mantém na ordem de
// tabulação e na árvore de acessibilidade (ao contrário de `hidden` ou
// `display:none`, que o tirariam das duas). O <label> associado é o que
// aparece, e o anel de foco vive nele via `peer-focus-visible` — então
// navegar por teclado até o campo continua mostrando onde se está.
//
// Nada da lógica de upload mora aqui: o `onChange` é do componente que
// usa, junto com a validação e o `accept` de sempre.
export function BotaoEscolherArquivo({
  onArquivo,
  accept,
  disabled,
  rotulo,
  descricaoAcessivel,
  className,
}: {
  onArquivo: (evento: React.ChangeEvent<HTMLInputElement>) => void;
  accept: string;
  disabled?: boolean;
  /** Texto visível do botão, ex.: "Alterar logotipo". */
  rotulo: string;
  /** Nome acessível do campo em si, ex.: "Enviar logotipo". */
  descricaoAcessivel: string;
  className?: string;
}) {
  // useId: pode haver mais de um upload na mesma tela (logotipo, favicon,
  // logotipo do rodapé, hero) e o htmlFor precisa ser único em cada um.
  const id = useId();

  return (
    <div className={cn("min-w-0", className)}>
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={onArquivo}
        disabled={disabled}
        aria-label={descricaoAcessivel}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={cn(
          "inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-medium transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          // O foco é do input (sr-only); o anel tem de aparecer aqui,
          // senão o teclado navega para um controle invisível.
          "peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <Upload aria-hidden className="size-4 shrink-0" />
        {rotulo}
      </label>
    </div>
  );
}
