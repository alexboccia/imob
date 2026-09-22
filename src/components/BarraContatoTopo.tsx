import { Clock } from "lucide-react";
import {
  IconeInstagram,
  IconeFacebook,
  IconeYoutube,
  IconeLinkedin,
  IconeTiktok,
} from "@/components/icones-sociais";
import { IconeTelefone, IconeWhatsApp } from "@/components/icons";
import { cn } from "@/lib/utils";
import { separadoresDaBarra } from "@/lib/contatos-publicos";
import type { CanalPublico, ChaveCanal } from "@/lib/contatos-publicos";
import type { EstiloBarraTopo } from "@/lib/branding/cor-barra-topo";

// =======================================================================
// Barra superior de contato (Fase 58, recomposta na 58.2)
// =======================================================================
// Fica ACIMA do cabeçalho de navegação e existe apenas quando o tenant
// habilitou alguma coisa para o topo. Sem conteúdo, quem renderiza não a
// monta: a barra não fica vazia, ela não existe.
//
// COMPOSIÇÃO (58.4):
//
//        [ ◷ horário | redes | ☎ telefone  WhatsApp ]
//                                                    ^ borda do container
//
// TRÊS GRUPOS, UM BLOCO SÓ, encostado à direita. Na 58.2 o horário ficava
// sozinho no extremo esquerdo e o resto no extremo direito, com um vazio
// enorme no meio: a barra parecia duas barras. Agora o horário é o
// primeiro item do mesmo grupo, imediatamente antes das redes, e o
// espaço flexível fica todo à esquerda do bloco.
//
// O alinhamento é `justify-end` no container — sem margem arbitrária,
// sem posicionamento absoluto, sem largura fixa. A borda direita
// continua sendo a do container público (max-w-6xl), a mesma da
// navegação principal logo abaixo.
//
// SEPARADORES POR GRUPO, nunca por combinação: cada um só é renderizado
// quando existe conteúdo dos dois lados dele — ver `separadorAntesDe*`
// abaixo, onde a regra inteira mora.
//
// VISUAL: discreta de propósito — texto pequeno, uma linha. Sem
// personalização (o padrão), as cores saem dos tokens do tenant:
// `bg-muted`/`text-muted-foreground`, exatamente como sempre foi.
//
// COM personalização (Fase 58.5), o fundo é o hex escolhido pela
// organização e o conteúdo é DERIVADO dele por contraste — nunca uma
// segunda cor escolhida à mão, que permitiria salvar texto escuro sobre
// fundo escuro. Os valores entram como propriedades de estilo já
// validadas como "#RRGGBB"; nada de classe Tailwind montada com texto do
// banco, nada de CSS injetado. Ver estiloDaBarraTopo.
//
// MOBILE: as redes somem abaixo de sm (não cabem junto de horário e
// telefone em 320px) e reaparecem no menu mobile, que o SiteHeader
// monta. Horário, telefone e WhatsApp continuam na barra em qualquer
// largura, quebrando em duas linhas quando preciso.

const ICONES: Record<ChaveCanal, (props: { className?: string }) => React.ReactElement> = {
  telefone: IconeTelefone,
  whatsapp: IconeWhatsApp,
  instagram: IconeInstagram,
  facebook: IconeFacebook,
  linkedin: IconeLinkedin,
  youtube: IconeYoutube,
  tiktok: IconeTiktok,
};

function Item({
  canal,
  somenteIcone,
  estilo,
}: {
  canal: CanalPublico;
  somenteIcone: boolean;
  estilo: EstiloBarraTopo | null;
}) {
  const Icone = ICONES[canal.chave];
  // O verde do WhatsApp é a ÚNICA cor desta barra que não vem do tema do
  // tenant, e é intencional: ele comunica de qual serviço se trata antes
  // de qualquer leitura. Vem do token `whatsapp-brand` que o projeto já
  // centraliza (globals.css) e que o botão flutuante e a ficha do imóvel
  // usam — um segundo verde só para esta barra criaria duas marcas para
  // o mesmo serviço.
  //
  // A cor NUNCA é o único sinal: o item tem texto "WhatsApp" visível
  // (ou nome acessível, quando só o ícone aparece).
  const ehWhatsApp = canal.chave === "whatsapp";

  return (
    <a
      href={canal.href}
      data-canal-topo={canal.chave}
      target={canal.externo ? "_blank" : undefined}
      rel={canal.externo ? "noopener noreferrer" : undefined}
      aria-label={somenteIcone ? canal.rotulo : undefined}
      className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded px-1 py-1 transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
    >
      {/* A cor entra pelo `span` porque os ícones do projeto recebem só
          `className` e pintam com `currentColor` — assim nenhum deles
          precisa aprender uma prop de estilo. Com fundo personalizado, o
          verde do WhatsApp é medido contra esse fundo: continua verde
          quando dá para distinguir e cede ao conteúdo quando não daria.
          O token GLOBAL segue intocado — a decisão é só desta barra. */}
      <span
        className={cn(
          "flex shrink-0 items-center",
          ehWhatsApp && !estilo && "text-whatsapp-brand"
        )}
        style={ehWhatsApp && estilo ? { color: estilo.whatsapp } : undefined}
      >
        <Icone className="size-4 shrink-0" />
      </span>
      {somenteIcone ? null : <span className="whitespace-nowrap">{canal.texto}</span>}
    </a>
  );
}

export function BarraContatoTopo({
  canais,
  horario,
  estilo = null,
}: {
  canais: CanalPublico[];
  /** Texto já resolvido (preenchido E habilitado) ou null. */
  horario?: string | null;
  /** Cores resolvidas, ou null para manter o visual padrão. */
  estilo?: EstiloBarraTopo | null;
}) {
  const contatos = canais.filter((c) => c.tipo !== "REDE");
  const redes = canais.filter((c) => c.tipo === "REDE");
  // Guarda de segurança: montada sem nada, não produz elemento na página.
  if (!horario && contatos.length === 0 && redes.length === 0) return null;

  // A regra inteira vive em separadoresDaBarra (contatos-publicos.ts),
  // onde as oito combinações de grupos são testadas uma a uma.
  const separadores = separadoresDaBarra({
    temHorario: Boolean(horario),
    temRedes: redes.length > 0,
    temContatos: contatos.length > 0,
  });

  return (
    <div
      data-barra-contato-topo
      // Uma cor configurada NÃO faz a barra existir: a guarda acima
      // continua sendo o conteúdo. Fundo sem conteúdo não vira faixa.
      data-barra-personalizada={estilo ? "" : undefined}
      className={cn("border-b", !estilo && "bg-muted text-muted-foreground")}
      style={estilo ? { backgroundColor: estilo.fundo, color: estilo.conteudo } : undefined}
    >
      {/* justify-end: o bloco inteiro encosta na direita e o espaço
          flexível fica à esquerda dele. */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-y-1 px-4 py-1.5 text-sm">
        <div data-grupo-direito className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {horario && (
            <p data-horario-topo className="flex min-w-0 items-center gap-1.5">
              <Clock className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{horario}</span>
            </p>
          )}

          {separadores.antesDasRedes && (
            <Separador
              className={separadores.antesDasRedesSoNoDesktop ? "hidden sm:block" : ""}
            />
          )}

          {redes.length > 0 && (
            <div className="hidden shrink-0 items-center gap-1 sm:flex">
              {redes.map((canal) => (
                <Item key={canal.chave} canal={canal} somenteIcone estilo={estilo} />
              ))}
            </div>
          )}

          {/* Este acompanha as redes: com elas escondidas, quem separa
              horário e contatos é o traço acima. */}
          {separadores.antesDosContatos && <Separador className="hidden sm:block" />}

          {contatos.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              {contatos.map((canal) => (
                <Item key={canal.chave} canal={canal} somenteIcone={false} estilo={estilo} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * O `|` entre grupos. Uma borda de 1px em vez do caractere: o traço fica
 * com altura previsível e não é lido por leitor de tela, que já percebe
 * a separação pela estrutura. O respiro dos dois lados vem do `gap` do
 * container — nada de margem própria.
 */
function Separador({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-separador-topo
      className={cn("h-4 w-px shrink-0 bg-current opacity-25", className)}
    />
  );
}
