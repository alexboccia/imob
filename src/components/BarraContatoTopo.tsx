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
import type { CanalPublico, ChaveCanal } from "@/lib/contatos-publicos";

// =======================================================================
// Barra superior de contato (Fase 58, recomposta na 58.2)
// =======================================================================
// Fica ACIMA do cabeçalho de navegação e existe apenas quando o tenant
// habilitou alguma coisa para o topo. Sem conteúdo, quem renderiza não a
// monta: a barra não fica vazia, ela não existe.
//
// COMPOSIÇÃO (58.2):
//
//   [ ◷ horário ]                    [ redes | ☎ telefone  WhatsApp ]
//
// O horário é o único item da esquerda; TODO o resto vai para a direita,
// na ordem redes -> telefone -> WhatsApp. Antes telefone e WhatsApp
// ficavam à esquerda junto do horário; passaram para a direita porque é
// ali que a pessoa procura ação de contato, e o horário é contexto.
//
// O alinhamento é decidido por `justify-*` no container, não por margem
// solta: com horário, `justify-between` separa os dois grupos; sem
// horário, `justify-end` mantém o grupo direito colado à direita sem
// precisar de um elemento vazio segurando a esquerda.
//
// VISUAL: discreta de propósito — fundo `muted`, texto pequeno, uma
// linha. Todas as cores saem dos tokens do tenant, com UMA exceção
// documentada: o ícone do WhatsApp (ver abaixo).
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

function Item({ canal, somenteIcone }: { canal: CanalPublico; somenteIcone: boolean }) {
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
      <Icone
        className={cn(
          "size-4 shrink-0",
          ehWhatsApp && "text-whatsapp-brand"
        )}
      />
      {somenteIcone ? null : <span className="whitespace-nowrap">{canal.texto}</span>}
    </a>
  );
}

export function BarraContatoTopo({
  canais,
  horario,
}: {
  canais: CanalPublico[];
  /** Texto já resolvido (preenchido E habilitado) ou null. */
  horario?: string | null;
}) {
  const contatos = canais.filter((c) => c.tipo !== "REDE");
  const redes = canais.filter((c) => c.tipo === "REDE");
  const temDireita = contatos.length > 0 || redes.length > 0;

  // Guarda de segurança: montada sem nada, não produz elemento na página.
  if (!horario && !temDireita) return null;

  return (
    <div data-barra-contato-topo className="border-b bg-muted text-muted-foreground">
      <div
        className={cn(
          "mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-sm",
          // Com os dois grupos, um vai para cada ponta. Só com o direito,
          // ele encosta na direita sozinho — sem div vazia à esquerda.
          horario && temDireita ? "justify-between" : horario ? "justify-start" : "justify-end"
        )}
      >
        {horario && (
          <p data-horario-topo className="flex min-w-0 items-center gap-1.5">
            <Clock className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{horario}</span>
          </p>
        )}

        {temDireita && (
          <div data-grupo-direito className="flex shrink-0 items-center gap-x-3 gap-y-1">
            {redes.length > 0 && (
              <div className="hidden shrink-0 items-center gap-1 sm:flex">
                {redes.map((canal) => (
                  <Item key={canal.chave} canal={canal} somenteIcone />
                ))}
              </div>
            )}

            {/* Separador SÓ quando existe conteúdo dos dois lados dele —
                e só quando as redes estão de fato visíveis (elas somem
                abaixo de sm), para não sobrar um traço solto no mobile. */}
            {redes.length > 0 && contatos.length > 0 && (
              <span
                aria-hidden="true"
                data-separador-topo
                className="hidden h-4 w-px shrink-0 bg-current opacity-25 sm:block"
              />
            )}

            {contatos.length > 0 && (
              <div className="flex shrink-0 items-center gap-x-3 gap-y-1">
                {contatos.map((canal) => (
                  <Item key={canal.chave} canal={canal} somenteIcone={false} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
