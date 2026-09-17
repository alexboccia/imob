import Link from "next/link";
import { ImovelCard } from "@/components/ImovelCard";
import { buttonVariants } from "@/components/ui/button";
import { TITULO_SECAO, SUBTITULO_SECAO } from "@/lib/site-typography";
import type { paraImovelCard } from "@/lib/imovel-card";

// Seção de grade de imóveis com título e "Ver tudo" — vivia inline na
// Home. Extraída porque as próximas páginas comerciais (detalhe do
// imóvel, lançamento) mostram a MESMA grade com outro recorte ("imóveis
// semelhantes", "outras unidades"), e duplicar isso é justamente o que
// faria as páginas divergirem visualmente com o tempo.
//
// Continua Server Component: só recebe dados já buscados e renderiza.
export function SecaoImoveis({
  titulo,
  descricao,
  imoveis,
  verTudoHref,
  // Rótulo do link. Default "Ver tudo" — o texto que todas as seções já
  // usam; a vitrine da Home pede "Ver todos" por concordância com
  // "imóveis". Um parâmetro em vez de um componente novo.
  verTudoRotulo = "Ver tudo",
  // Colunas no desktop. As seções existentes mostram três; a vitrine
  // mostra até quatro. Configurar o componente é melhor que duplicá-lo
  // quase idêntico só por causa de uma coluna.
  colunas = 3,
  basePath,
  orgSlugFavorito,
  id,
}: {
  titulo: string;
  descricao?: string;
  imoveis: ReturnType<typeof paraImovelCard>[];
  verTudoHref?: string;
  verTudoRotulo?: string;
  colunas?: 3 | 4;
  basePath: string;
  /** Fase 50 — liga o coração dos cards (ver ImovelCard). */
  orgSlugFavorito?: string;
  id?: string;
}) {
  if (imoveis.length === 0) return null;

  return (
    <section id={id} className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className={TITULO_SECAO}>{titulo}</h2>
          {descricao && <p className={`${SUBTITULO_SECAO} mt-1`}>{descricao}</p>}
        </div>
        {/* Link de verdade, com a APARÊNCIA de botão-link — e não um
            <Button render={<Link/>}>, que era o que havia aqui. Aquele
            caminho renderiza <a role="button">: para quem usa leitor de
            tela, o elemento se anunciava como botão, prometendo uma ação
            na página em vez da navegação que ele de fato faz. Mesmas
            classes, mesma aparência; muda a semântica, que estava
            errada. buttonVariants em <a> já é o idioma do projeto (ver
            os CTAs de contato do perfil do corretor). */}
        {verTudoHref && (
          <Link
            href={verTudoHref}
            className={buttonVariants({ variant: "link", className: "h-auto p-0" })}
          >
            {verTudoRotulo}
          </Link>
        )}
      </div>
      {/* Quatro cards lado a lado só a partir de xl: em lg (1024px) eles
          ficariam estreitos demais para a foto dominante e os dados
          essenciais caberem sem espremer. Abaixo disso a grade cai para
          duas colunas e depois uma, que é o comportamento das outras
          seções — nenhuma rolagem horizontal é introduzida. */}
      <div
        className={
          colunas === 4
            ? "grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4"
            : "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {imoveis.map((imovel) => (
          <ImovelCard
            key={imovel.id}
            imovel={imovel}
            basePath={basePath}
            orgSlugFavorito={orgSlugFavorito}
          />
        ))}
      </div>
    </section>
  );
}
