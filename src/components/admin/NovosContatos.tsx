import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { BotaoCriarOportunidade } from "@/components/admin/BotaoCriarOportunidade";
import { RegistrarAtendimento } from "@/components/admin/RegistrarAtendimento";
import { PosseContato } from "@/components/admin/PosseContato";
import { IconeWhatsApp } from "@/components/icons";
import { rotuloOrigemCaptacao } from "@/lib/captacao";
import { oportunidadeElegivel } from "@/lib/oportunidade";
import { formatarPreco, FINALIDADE_LABEL } from "@/lib/format";
import { linkWhatsApp } from "@/lib/whatsapp";
import { HORAS_PARA_ALERTA, type NovoContato, type NovosContatos as Dados } from "@/lib/novos-contatos";
import type { OpcaoResponsavel } from "@/lib/responsavel-negociacao";

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

function ItemContato({
  contato,
  meuMemberId,
  podeAtribuir,
  membros,
}: {
  contato: NovoContato;
  meuMemberId: string | null;
  podeAtribuir: boolean;
  membros: OpcaoResponsavel[];
}) {
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
          {/* Responsável pelo IMÓVEL — dimensão diferente da posse do
              contato logo abaixo, e por isso o rótulo é explícito nas
              duas linhas. */}
          Responsável pelo imóvel: {contato.imovel.responsavel}
        </p>
      )}

      {/* Fase 36 — de quem é este lead. Vem antes das ações: a primeira
          pergunta é "isto é meu?", e só depois "o que eu faço agora". */}
      <PosseContato
        personId={contato.pessoa.id}
        nomePessoa={contato.pessoa.nome}
        responsavel={contato.responsavel}
        souEu={contato.responsavel !== null && contato.responsavel.memberId === meuMemberId}
        podeAtribuir={podeAtribuir}
        membros={membros}
      />

      {/* Hierarquia: REGISTRAR ATENDIMENTO é a ação principal — é ela que
          fecha o ciclo e tira o contato da fila. WhatsApp fica ao lado
          como ação rápida (e continua não registrando nada: clicar não é
          conversar). "Abrir cliente" saiu: o nome da pessoa, logo acima,
          já é esse link, e um botão a mais transformaria o card numa
          árvore de botões sem acrescentar capacidade. */}
      <div data-acoes-contato className="mt-2 flex flex-wrap items-center gap-2">
        <RegistrarAtendimento interactionId={contato.id} nomePessoa={contato.pessoa.nome} />
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Falar no WhatsApp com ${contato.pessoa.nome}`}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "text-whatsapp-brand hover:text-whatsapp-brand-hover",
            })}
          >
            <IconeWhatsApp className="size-4" />
            WhatsApp
          </a>
        )}
        {oportunidadeElegivel({ origin: contato.origem, propertyId: contato.imovel?.id ?? null }) && (
          <BotaoCriarOportunidade interactionId={contato.id} />
        )}
      </div>
    </li>
  );
}

export function NovosContatos({
  dados,
  meuMemberId,
  podeAtribuir,
  membros,
}: {
  dados: Dados;
  /** Membro da SESSÃO, resolvido no servidor — nunca lido do cliente. */
  meuMemberId: string | null;
  podeAtribuir: boolean;
  membros: OpcaoResponsavel[];
}) {
  if (dados.itens.length === 0) return null;

  // FILA DE DISTRIBUIÇÃO: quantos dos contatos exibidos ainda não são de
  // ninguém. Contado sobre o que está na tela, sem uma segunda consulta —
  // é uma chamada à ação, não uma métrica.
  const semResponsavel = dados.itens.filter((c) => c.responsavel === null).length;

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
        {/* Texto, não cor: a fila diz em palavras quantos precisam de
            dono. Assumir e atribuir NÃO tiram o contato daqui — só o
            atendimento registrado faz isso. */}
        {semResponsavel > 0 && (
          <p className="pt-1 text-sm text-muted-foreground">
            {semResponsavel === 1
              ? "1 destes ainda está sem responsável."
              : `${semResponsavel} destes ainda estão sem responsável.`}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ul>
          {dados.itens.map((contato) => (
            <ItemContato
              key={contato.id}
              contato={contato}
              meuMemberId={meuMemberId}
              podeAtribuir={podeAtribuir}
              membros={membros}
            />
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
