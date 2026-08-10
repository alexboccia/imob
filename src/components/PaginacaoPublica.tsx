import Link from "next/link";

// Paginação da listagem pública — sempre com <Link href> reais (nunca só
// onClick/JS), pra manter as páginas 2, 3, 4... rastreáveis por buscadores
// (preserva SEO em vez de esconder o resto do catálogo atrás de um botão
// "carregar mais" só-JS).
export function PaginacaoPublica({
  basePath,
  paginaAtual,
  totalPaginas,
  searchParams,
}: {
  basePath: string;
  paginaAtual: number;
  totalPaginas: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (totalPaginas <= 1) return null;

  function hrefParaPagina(pagina: number): string {
    const params = new URLSearchParams();
    for (const [chave, valor] of Object.entries(searchParams)) {
      if (chave === "page" || valor === undefined) continue;
      if (Array.isArray(valor)) valor.forEach((v) => params.append(chave, v));
      else params.set(chave, valor);
    }
    if (pagina > 1) params.set("page", String(pagina));
    const query = params.toString();
    return `${basePath}${query ? `?${query}` : ""}`;
  }

  const paginas = paginasVisiveis(paginaAtual, totalPaginas);

  return (
    <nav aria-label="Paginação" className="flex items-center justify-center gap-2 mt-10 flex-wrap">
      <LinkPagina
        href={hrefParaPagina(Math.max(1, paginaAtual - 1))}
        desabilitado={paginaAtual <= 1}
      >
        Anterior
      </LinkPagina>
      {paginas.map((pagina, i) =>
        pagina === "..." ? (
          <span key={`ellipsis-${i}`} className="px-2 text-gray-400">
            …
          </span>
        ) : (
          <Link
            key={pagina}
            href={hrefParaPagina(pagina)}
            aria-current={pagina === paginaAtual ? "page" : undefined}
            className={`px-3 py-2 rounded-md border text-sm ${
              pagina === paginaAtual
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-gray-50"
            }`}
          >
            {pagina}
          </Link>
        )
      )}
      <LinkPagina
        href={hrefParaPagina(Math.min(totalPaginas, paginaAtual + 1))}
        desabilitado={paginaAtual >= totalPaginas}
      >
        Próxima
      </LinkPagina>
    </nav>
  );
}

function LinkPagina({
  href,
  desabilitado,
  children,
}: {
  href: string;
  desabilitado: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-disabled={desabilitado}
      tabIndex={desabilitado ? -1 : undefined}
      className={`px-3 py-2 rounded-md border text-sm ${
        desabilitado ? "pointer-events-none opacity-40" : "hover:bg-gray-50"
      }`}
    >
      {children}
    </Link>
  );
}

function paginasVisiveis(atual: number, total: number): (number | "...")[] {
  const janela = 2;
  const paginas: (number | "...")[] = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= atual - janela && p <= atual + janela)) {
      paginas.push(p);
    } else if (paginas[paginas.length - 1] !== "...") {
      paginas.push("...");
    }
  }
  return paginas;
}
