import { Rotate3d, Ruler, Play } from "lucide-react";
import type { RecursoImovel } from "@/lib/recursos-imovel";

// Barra de recursos do imóvel (Fase 39) — logo abaixo da galeria.
//
// Tour 360° · Planta · Vídeo, e SÓ o que o imóvel realmente tem. A
// decisão de quais aparecem é do domínio (recursosDoImovel); aqui só se
// desenha o que chegou.
//
// SÃO LINKS, não botões: os três NAVEGAM — dois para seções da própria
// página, um para o site onde o tour está hospedado. Um <button> aqui
// tiraria do visitante o menu de contexto, o abrir-em-nova-aba e a
// leitura de "link" pelo leitor de tela.
//
// AÇÃO SECUNDÁRIA, de propósito: borda leve, fundo neutro, sem cor de
// destaque. A conversão da ficha é o contato; isto é exploração, e
// competir com o CTA principal seria desenhar contra o próprio funil.
//
// Server Component: nada aqui tem estado.

const ICONE = {
  // Rotate3d comunica "girar em 360°" melhor que um cubo, e já vem do
  // lucide-react que o projeto inteiro usa — nenhuma biblioteca nova
  // entrou por causa de três ícones.
  tour: Rotate3d,
  // Régua: planta é medida, não fotografia.
  planta: Ruler,
  video: Play,
} as const;

export function RecursosImovel({ recursos }: { recursos: RecursoImovel[] }) {
  // Nenhum recurso, nenhuma barra — nunca um bloco vazio, e nunca um
  // botão que não leva a lugar nenhum.
  if (recursos.length === 0) return null;

  return (
    <nav
      aria-label="Recursos do imóvel"
      data-recursos-imovel
      // flex-wrap: em 320px os três descem naturalmente para outra linha
      // em vez de encolher ou estourar. Sem carrossel — três itens não
      // justificam um componente com teclado e touch próprios.
      className="mt-4 flex flex-wrap items-center gap-2"
    >
      {recursos.map((recurso) => {
        const Icone = ICONE[recurso.chave];
        return (
          <a
            key={recurso.chave}
            href={recurso.href}
            // Nova aba só para o tour, que sai do site. rel completo:
            // noopener fecha o acesso ao window.opener, noreferrer não
            // entrega o endereço desta ficha ao destino.
            {...(recurso.externo
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            // min-h-11: alvo de toque confortável no celular, que é onde
            // esta barra mais é usada.
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            {/* Ícone decorativo: o rótulo ao lado já diz tudo, e anunciá-lo
                duas vezes atrapalharia quem usa leitor de tela. */}
            <Icone className="size-4 shrink-0" aria-hidden />
            {recurso.rotulo}
            {/* O aviso de nova aba é TEXTO para leitor de tela — sem ele,
                o tour abriria fora sem avisar ninguém. */}
            {recurso.externo && <span className="sr-only">(abre em nova aba)</span>}
          </a>
        );
      })}
    </nav>
  );
}
