import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { BotaoCriarOportunidade } from "@/components/admin/BotaoCriarOportunidade";
import { IconeWhatsApp } from "@/components/icons";
import { rotuloOrigemCaptacao } from "@/lib/captacao";
import { oportunidadeElegivel } from "@/lib/oportunidade";
import { formatarPreco, FINALIDADE_LABEL } from "@/lib/format";
import { linkWhatsApp } from "@/lib/whatsapp";
import { HORAS_PARA_ALERTA, type NovoContato, type NovosContatos as Dados } from "@/lib/novos-contatos";

// Caixa de entrada comercial — o primeiro bloco da Central.
//
// Server Component puro. Só o botão de criar oportunidade é cliente, e
// ele já existia: é o MESMO componente usado no histórico do cliente,
// chamando a MESMA action endurecida. Nada de regra de negócio aqui.
//
// A ordem é o relógio: mais recente primeiro. Velocidade de resposta é o
// que converte um contato de site, e a pergunta que o corretor faz ao
// abrir o painel é "quem acabou de chegar?". Para que o antigo não seja
// esquecido por causa disso, quem passou de um dia carrega o tempo de
// espera em destaque — o mesmo raciocínio do "atrasado" da Agenda, sem
// inventar score nem temperatura.

function tempoDeEspera(horas: number): string {
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

function precoRelevante(imovel: NonNullable<NovoContato["imovel"]>): string | null {
  // Aluguel mostra o aluguel; venda mostra a venda. Mostrar o campo
  // errado é o bug que a listagem pública já corrigiu uma vez.
  const valor = imovel.finalidade === "RENT" ? imovel.precoAluguel : imovel.preco;
  return valor ? formatarPreco(valor) : null;
}

function ItemContato({ contato }: { contato: NovoContato }) {
  const origem = rotuloOrigemCaptacao(contato.origem);
  const alerta = contato.aguardandoHaHoras >= HORAS_PARA_ALERTA;

  // Mensagem com o contexto que o corretor já tem na tela. Abrir o
  // WhatsApp NÃO registra atendimento nenhum e não tira o contato da
  // fila: clicar não é conversar, e o produto não afirma o que não pode
  // verificar (mesma doutrina do analytics de wa.me).
  const whatsapp = linkWhatsApp(
    contato.pessoa.telefone,
    contato.imovel
      ? `Olá, ${contato.pessoa.nome}! Vi seu contato sobre "${contato.imovel.titulo}".`
      : `Olá, ${contato.pessoa.nome}! Recebi seu contato pelo site.`
  );

  return (
    <li className="border-b py-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Link
          href={`/app/clientes/${contato.pessoa.id}`}
          className="min-w-0 break-words font-medium text-primary underline-offset-4 hover:underline"
        >
          {contato.pessoa.nome}
        </Link>
        {origem && (
          <Badge variant="outline" className="shrink-0">
            {origem}
          </Badge>
        )}
        <span
          className={
            alerta
              ? "shrink-0 text-xs font-medium text-destructive"
              : "shrink-0 text-xs text-muted-foreground"
          }
        >
          {tempoDeEspera(contato.aguardandoHaHoras)}
        </span>
      </div>

      {/* Contexto do imóvel: o suficiente para reconhecer, nunca uma
          segunda ficha. Foto pequena, título, código e o preço da
          finalidade certa. */}
      {contato.imovel && (
        <Link
          href={`/app/imoveis/${contato.imovel.id}`}
          className="mt-2 flex items-center gap-2 rounded-md border p-2 hover:bg-muted/50"
        >
          {contato.imovel.foto ? (
            <Image
              src={contato.imovel.foto}
              alt=""
              width={56}
              height={42}
              className="h-[42px] w-14 shrink-0 rounded object-cover"
            />
          ) : (
            <span aria-hidden className="h-[42px] w-14 shrink-0 rounded bg-muted" />
          )}
          <span className="min-w-0">
            <span className="block min-w-0 break-words text-sm font-medium">
              {contato.imovel.titulo}
            </span>
            <span className="block text-xs text-muted-foreground">
              {contato.imovel.codigo !== null && `Cód. ${contato.imovel.codigo} · `}
              {FINALIDADE_LABEL[contato.imovel.finalidade] ?? contato.imovel.finalidade}
              {precoRelevante(contato.imovel) && ` · ${precoRelevante(contato.imovel)}`}
            </span>
          </span>
        </Link>
      )}

      {contato.mensagem && (
        <p className="mt-2 min-w-0 break-words text-sm text-muted-foreground">
          “{contato.mensagem}”
        </p>
      )}

      {contato.imovel?.responsavel && (
        <p className="mt-1 text-xs text-muted-foreground">
          Responsável pelo imóvel: {contato.imovel.responsavel}
        </p>
      )}

      {/* Ações: alvo de toque confortável e quebra de linha no celular,
          que é onde o corretor atende. */}
      <div data-acoes-contato className="mt-2 flex flex-wrap items-center gap-2">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Falar no WhatsApp com ${contato.pessoa.nome}`}
            className={buttonVariants({
              size: "sm",
              className:
                "bg-whatsapp-brand text-white hover:bg-whatsapp-brand-hover active:bg-whatsapp-brand-active",
            })}
          >
            <IconeWhatsApp className="size-4" />
            WhatsApp
          </a>
        )}
        <Link
          href={`/app/clientes/${contato.pessoa.id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Abrir cliente
        </Link>
        {oportunidadeElegivel({ origin: contato.origem, propertyId: contato.imovel?.id ?? null }) && (
          <BotaoCriarOportunidade interactionId={contato.id} />
        )}
      </div>
    </li>
  );
}

export function NovosContatos({ dados }: { dados: Dados }) {
  if (dados.itens.length === 0) return null;

  return (
    <Card data-novos-contatos>
      <CardHeader className="pb-2">
        <h2 className="flex flex-wrap items-center gap-2 font-semibold">
          Novos contatos
          <Badge variant="secondary">
            {dados.total}
            {dados.truncado && "+"}
          </Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          Chegaram pelo site e ninguém registrou atendimento ainda.
        </p>
      </CardHeader>
      <CardContent>
        <ul>
          {dados.itens.map((contato) => (
            <ItemContato key={contato.id} contato={contato} />
          ))}
        </ul>
        {dados.total > dados.itens.length && (
          <p className="mt-3 text-sm text-muted-foreground">
            e mais {dados.total - dados.itens.length} aguardando atendimento.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
