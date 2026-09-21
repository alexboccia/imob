import {
  IconeInstagram,
  IconeFacebook,
  IconeYoutube,
  IconeLinkedin,
  IconeTiktok,
} from "@/components/icones-sociais";
import { IconeTelefone, IconeWhatsApp } from "@/components/icons";
import type { CanalPublico, ChaveCanal } from "@/lib/contatos-publicos";

// =======================================================================
// Barra superior de contato (Fase 58)
// =======================================================================
// Fica ACIMA do cabeçalho de navegação, e existe apenas quando o tenant
// configurou pelo menos um canal para o topo. Sem canais, quem renderiza
// não monta este componente — a barra não fica vazia, ela não existe, e
// o site volta a ser exatamente o cabeçalho de sempre.
//
// VISUAL: discreta de propósito — fundo `muted`, texto pequeno, uma
// linha só. Ela não pode competir com o logotipo, que é o elemento de
// marca logo abaixo. Todas as cores saem dos tokens do tenant
// (`bg-muted`, `text-muted-foreground`, `hover:text-primary`), nunca de
// um hex escolhido aqui: cada organização tem a sua paleta.
//
// MOBILE: os contatos (telefone/WhatsApp) ficam; as redes somem abaixo
// de sm. Espremer telefone + WhatsApp + cinco ícones em 320px produziria
// ou estouro horizontal ou alvos de toque pequenos demais. As redes
// continuam acessíveis no rodapé, que é onde se procura por elas.

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
  return (
    <a
      href={canal.href}
      data-canal-topo={canal.chave}
      // Mesma política de link externo do resto do site.
      target={canal.externo ? "_blank" : undefined}
      rel={canal.externo ? "noopener noreferrer" : undefined}
      // Nas redes só o ícone aparece; o nome acessível vem do aria-label,
      // nunca de um texto visível que engordaria a barra.
      aria-label={somenteIcone ? canal.rotulo : undefined}
      className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded px-1 py-1 transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
    >
      <Icone className="size-4 shrink-0" />
      {somenteIcone ? null : <span className="whitespace-nowrap">{canal.texto}</span>}
    </a>
  );
}

export function BarraContatoTopo({ canais }: { canais: CanalPublico[] }) {
  // Guarda de segurança: mesmo que alguém a monte sem canais, ela não
  // produz um elemento vazio na página.
  if (canais.length === 0) return null;

  const contatos = canais.filter((c) => c.tipo !== "REDE");
  const redes = canais.filter((c) => c.tipo === "REDE");

  return (
    <div
      data-barra-contato-topo
      className="border-b bg-muted text-muted-foreground"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 text-sm">
        {/* Cada grupo só existe se tiver conteúdo — nada de div vazia
            segurando espaço nem separador órfão. */}
        {contatos.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            {contatos.map((canal) => (
              <Item key={canal.chave} canal={canal} somenteIcone={false} />
            ))}
          </div>
        )}

        {redes.length > 0 && (
          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            {redes.map((canal) => (
              <Item key={canal.chave} canal={canal} somenteIcone />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
