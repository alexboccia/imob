import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getR2Client } from "@/lib/r2";
import { logger } from "@/lib/logger";

// =======================================================================
// Módulo reutilizável de remoção de objetos no R2 (Fase 120-C)
// =======================================================================
// Até esta fase, a única lógica de DeleteObjectsCommand do produto vivia
// duplicada dentro de limparMidiasOrfas (src/app/app/manutencao/actions.ts)
// — sem nenhum ponto reutilizável para quem precisasse remover um objeto
// de verdade fora daquela ferramenta manual (ex.: substituir uma foto).
// Este módulo centraliza isso, sempre com a mesma defesa em profundidade:
// NUNCA converte uma URL arbitrária em chave de exclusão sem confirmar
// que ela pertence ao prefixo da própria organização chamadora — mesmo
// que o caller já tenha, em teoria, filtrado a lista corretamente.
//
// ORDEM DE USO OBRIGATÓRIA (ver docs/tecnico/imagens/fase-120/05-CICLO-VIDA-R2.md):
// só chamar removerObjetosR2 DEPOIS que a operação de banco que apagou a
// referência (linha Media/PropertyPresentationMaterial) já foi CONFIRMADA
// com sucesso. Se a remoção no R2 falhar depois disso, o resultado é um
// objeto órfão (tolerável, resíduo já coberto pela limpeza de
// manutenção) — nunca uma referência quebrada (apagar no R2 antes do
// banco confirmar poderia deixar uma Media apontando para um objeto que
// não existe mais, caso a transação de banco falhasse depois).

export type ResultadoRemocaoR2 = {
  /** Quantas chaves foram de fato enviadas ao R2 para remoção. */
  tentativas: number;
  /** Quantas chaves foram rejeitadas por não pertencerem ao prefixo da organização — nunca enviadas ao R2. */
  rejeitadas: number;
  /** Lotes de remoção que falharam (erro do SDK) — chaves nesses lotes continuam existindo no R2, candidatas a limpeza posterior. */
  lotesComFalha: number;
};

/**
 * Extrai a chave do objeto R2 a partir da URL pública completa
 * ({R2_PUBLIC_URL}/{chave}), ou `null` se a URL não pertence ao bucket
 * público configurado. Mesma lógica já usada em limparMidiasOrfas,
 * extraída aqui para reaproveitamento.
 */
export function chaveDeUrlR2(url: string, publicUrl: string): string | null {
  if (!url.startsWith(`${publicUrl}/`)) return null;
  return url.slice(publicUrl.length + 1);
}

/**
 * Remove, em lotes de até 1000 (limite da própria API do S3/R2), os
 * objetos cujas URLs forem informadas — SEMPRE restrito ao prefixo
 * `{organizationId}/` do bucket. Qualquer URL fora desse prefixo (de
 * outra organização, de outro host, ou simplesmente inválida) é
 * silenciosamente descartada da lista de remoção, nunca enviada ao SDK.
 *
 * Idempotente: remover uma chave que já não existe no R2 não é erro
 * (comportamento padrão da API DeleteObjects) — chamar esta função mais
 * de uma vez com a mesma lista é seguro.
 *
 * Nunca lança: uma falha de rede/SDK em um lote é logada e contabilizada
 * em `lotesComFalha`, sem interromper os lotes seguintes nem propagar a
 * exceção ao chamador (o resíduo fica tolerável, nunca bloqueia o fluxo
 * principal — ex.: salvar a edição do imóvel não deve falhar porque o
 * R2 está temporariamente indisponível).
 */
export type ResultadoRemocaoPorChaves = {
  tentativas: number;
  lotesComFalha: number;
};

/**
 * Remove, em lotes de até 1000 (limite da própria API do S3/R2), as
 * chaves informadas — nível mais baixo, sem nenhuma validação de
 * prefixo/organização (quem chama já decidiu que as chaves são
 * legítimas; usado tanto por removerObjetosR2 abaixo quanto pelo
 * processamento de tarefas de limpeza de organização excluída, Fase
 * 120-D, onde as chaves vêm de uma listagem real do R2 por prefixo, não
 * de uma URL submetida por alguém).
 */
export async function removerChavesR2(bucket: string, chaves: string[]): Promise<ResultadoRemocaoPorChaves> {
  if (chaves.length === 0) return { tentativas: 0, lotesComFalha: 0 };

  const client = getR2Client();
  let lotesComFalha = 0;

  for (let i = 0; i < chaves.length; i += 1000) {
    const lote = chaves.slice(i, i + 1000);
    try {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: lote.map((Key) => ({ Key })) },
        })
      );
    } catch (erro) {
      lotesComFalha += 1;
      // Nunca logar a chave completa — só a contagem, suficiente para
      // investigar sem registrar caminho de arquivo específico.
      logger.error("Falha ao remover lote de objetos do R2", erro, {
        modulo: "r2-media",
        quantidadeNoLote: lote.length,
      });
    }
  }

  return { tentativas: chaves.length, lotesComFalha };
}

export async function removerObjetosR2(
  urls: string[],
  organizationId: string
): Promise<ResultadoRemocaoR2> {
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!bucket || !publicUrl || urls.length === 0) {
    return { tentativas: 0, rejeitadas: urls.length, lotesComFalha: 0 };
  }

  const prefixoOrganizacao = `${organizationId}/`;
  const chaves: string[] = [];
  let rejeitadas = 0;

  for (const url of urls) {
    const chave = chaveDeUrlR2(url, publicUrl);
    if (!chave || !chave.startsWith(prefixoOrganizacao)) {
      rejeitadas += 1;
      continue;
    }
    chaves.push(chave);
  }

  if (chaves.length === 0) {
    return { tentativas: 0, rejeitadas, lotesComFalha: 0 };
  }

  const { tentativas, lotesComFalha } = await removerChavesR2(bucket, chaves);
  return { tentativas, rejeitadas, lotesComFalha };
}
