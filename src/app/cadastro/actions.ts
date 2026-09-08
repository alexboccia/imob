"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { obterIpCliente } from "@/lib/client-ip";
import { obterKvStore } from "@/lib/kv-store";
import { normalizarEmail, verificarLimiteCadastro } from "@/lib/rate-limit";
import { derivarSlug } from "@/lib/slug-organizacao";
import {
  gerarTokenAcesso,
  hashToken,
  expiracaoCadastro,
  linkCadastro,
} from "@/lib/acesso-token";
import { enviarEmailCadastroImobiliaria } from "@/lib/email";
import {
  type ActionState,
  erroGenerico,
  erroValidacao,
  sucesso,
} from "@/lib/action-result";

// =======================================================================
// Pedido de cadastro de imobiliária (Fase 26)
// =======================================================================
// Esta action NÃO cria organização nenhuma. Ela guarda uma INTENÇÃO e
// manda um link para o e-mail declarado.
//
// A ordem importa e é o coração da fase: primeiro se prova posse do
// e-mail, depois nasce o tenant. Criar a organização já no envio do
// formulário daria, a qualquer pessoa digitando qualquer e-mail: um
// slug público ocupado para sempre, um trial de 14 dias consumido e uma
// organização órfã no backoffice.
//
// Sobre enumeração: a resposta é a mesma para e-mail que já tem conta e
// para e-mail novo. O único erro visível é sobre o NOME da imobiliária
// (slug vazio, reservado ou já em uso) — e isso é informação pública,
// descobrível abrindo /{slug} no navegador.

const cadastroSchema = z.object({
  nomeImobiliaria: z
    .string()
    .trim()
    .min(2, "Informe o nome da imobiliária.")
    .max(120, "Use no máximo 120 caracteres."),
  nomeResponsavel: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(120, "Use no máximo 120 caracteres."),
  // trim ANTES de validar: colar um endereço costuma trazer espaço
  // junto, e recusar isso com "E-mail inválido" culparia a pessoa por
  // algo que o produto sabe resolver sozinho.
  email: z.string().trim().email("E-mail inválido."),
});

export async function solicitarCadastro(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = cadastroSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const dados = parsed.data;

  const email = normalizarEmail(dados.email);
  if (!email) return erroGenerico("E-mail inválido.");

  const store = obterKvStore();
  if (store) {
    const ip = obterIpCliente(await headers());
    const limite = await verificarLimiteCadastro(store, { ip, emailNormalizado: email });
    if (!limite.permitido) {
      // Aqui o bloqueio é dito em voz alta, ao contrário da recuperação
      // de senha: não existe alvo a proteger (o pedido não revela nada
      // sobre contas), e esconder o limite faria a pessoa achar que o
      // e-mail saiu quando não saiu.
      return erroGenerico(
        "Muitos cadastros iniciados agora. Aguarde alguns minutos e tente novamente."
      );
    }
  }

  // Slug DERIVADO do nome, no servidor. O formulário não tem campo de
  // endereço: quem está cadastrando não conhece as regras de rota do
  // produto, e pedir isso no primeiro contato é atrito sem retorno.
  const resultadoSlug = derivarSlug(dados.nomeImobiliaria);
  if (!resultadoSlug.valido) {
    const mensagem =
      resultadoSlug.motivo === "reservado"
        ? "Esse nome não pode ser usado como endereço do site. Escolha outro."
        : "Use um nome com letras ou números — ele vira o endereço do seu site.";
    // Só o erro DE CAMPO: repetir a mesma frase no alerta geral faria a
    // pessoa ler duas vezes o mesmo problema.
    return { success: false, fieldErrors: { nomeImobiliaria: [mensagem] } };
  }

  // Colisão verificada aqui para dar erro no formulário, onde dá para
  // corrigir. NÃO é a garantia: a unique constraint do slug é, e ela é
  // reconferida na confirmação — entre este instante e o clique no
  // e-mail, outra pessoa pode ter levado o mesmo endereço.
  const slugEmUso = await prisma.organization.findUnique({
    where: { slug: resultadoSlug.slug },
    select: { id: true },
  });
  if (slugEmUso) {
    const mensagem =
      "Já existe uma imobiliária com esse endereço. Ajuste o nome para diferenciar.";
    // Só o erro DE CAMPO: repetir a mesma frase no alerta geral faria a
    // pessoa ler duas vezes o mesmo problema.
    return { success: false, fieldErrors: { nomeImobiliaria: [mensagem] } };
  }

  const token = gerarTokenAcesso();

  await prisma.$transaction(async (tx) => {
    // Pedido novo invalida os anteriores do mesmo e-mail: nunca dois
    // links de cadastro vivos para a mesma pessoa, pelo mesmo motivo da
    // recuperação de senha (Fase 25).
    await tx.signupToken.deleteMany({ where: { email, usedAt: null } });
    await tx.signupToken.create({
      data: {
        tokenHash: hashToken(token),
        email,
        orgName: dados.nomeImobiliaria,
        orgSlug: resultadoSlug.slug,
        ownerName: dados.nomeResponsavel,
        expiresAt: expiracaoCadastro(),
      },
    });
  });

  // Fora da transaction: nenhuma conexão do pool presa esperando rede de
  // terceiro. Se o envio falhar, o pedido existe e simplesmente expira
  // em 24h — nada foi criado, nada ficou incoerente, e a pessoa pode
  // tentar de novo.
  await enviarEmailCadastroImobiliaria({
    para: email,
    nomeImobiliaria: dados.nomeImobiliaria,
    linkCadastro: linkCadastro(token),
  });

  return sucesso();
}
