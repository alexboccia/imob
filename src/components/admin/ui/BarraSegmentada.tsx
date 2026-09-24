import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Barra segmentada do backoffice (Fase 65).
//
// É a MOLDURA visual consolidada nas abas de Configurações (Fase 63): a
// borda, o fundo e o padding pertencem ao contêiner, e o item ativo é a
// única pastilha dentro dele. Isso é o que faz um conjunto de opções ler
// como navegação secundária em vez de botões soltos.
//
// POR QUE SÓ A MOLDURA, e não um componente que também renderiza os itens:
// os três lugares que usam este visual têm semânticas DIFERENTES, e
// unificá-las seria mentir para o leitor de tela.
//   - Configurações: são abas reais (role="tablist"), com painéis no
//     cliente;
//   - Meu trabalho / Equipe: são LINKS — a visão é resolvida no servidor
//     por `?visao=`, então é <nav> + aria-current;
//   - Status / Tipo / Bairro: são botões de estado local, <button
//     aria-pressed>.
// Cada um mantém a sua semântica e reaproveita só a aparência, que é
// exatamente o que estava divergindo entre as telas.
export function BarraSegmentada({
  children,
  className,
  ...props
}: {
  children: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    // O wrapper rola; a barra é inline-flex com min-w-full para a borda
    // acompanhar o conteúdo e não a largura da página quando os itens não
    // couberem (mobile).
    <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1">
      <div
        data-barra-segmentada
        className={cn(
          "inline-flex min-w-full gap-1 rounded-xl border bg-muted/50 p-1",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

// Classes de um item da barra. Função, e não componente, porque cada uso
// renderiza um elemento diferente (<button role="tab">, <a>, <button
// aria-pressed>) — devolver classes deixa o elemento e a semântica com
// quem sabe qual é a correta.
//
// O estado ativo NÃO depende só de cor: é o único item com fundo, borda e
// sombra próprios.
export function classesItemSegmentado(ativo: boolean, extra?: string): string {
  return cn(
    "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    ativo
      ? "border border-border bg-background text-foreground shadow-sm"
      : "border border-transparent text-muted-foreground hover:text-foreground",
    extra
  );
}
