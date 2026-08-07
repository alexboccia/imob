import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

export type ResultadoIncremento = { contagem: number; ttlSegundos: number };

// Abstração mínima sobre o backend de rate limiting — permite trocar a
// implementação (produção: Upstash Redis) por um fake em memória nos
// testes, sem que a lógica de limite em si (rate-limit.ts) saiba a
// diferença. O fake de teste mora só no arquivo de teste, nunca aqui —
// isso não é "rate limiting em memória", é só como se testa a lógica pura
// sem precisar de credencial real do Upstash.
export interface KvStore {
  /**
   * Incrementa o contador da chave; se for a primeira vez (contador virou
   * 1 agora), aplica o TTL da janela. Operação atômica (Lua eval no
   * Redis) — sem isso, duas requisições simultâneas poderiam se
   * intercalar entre o INCR e o EXPIRE e a janela nunca expiraria.
   */
  incrementarComJanela(chave: string, janelaSegundos: number): Promise<ResultadoIncremento>;
  obter(chave: string): Promise<string | null>;
  definir(chave: string, valor: string, ttlSegundos: number): Promise<void>;
  remover(chave: string): Promise<void>;
  /** Segundos restantes até expirar; 0 (ou negativo) se a chave não existir. */
  ttl(chave: string): Promise<number>;
}

const SCRIPT_INCREMENTO_COM_JANELA = `
local atual = redis.call("INCR", KEYS[1])
if atual == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return {atual, ttl}
`;

export class UpstashKvStore implements KvStore {
  constructor(private readonly redis: Redis) {}

  async incrementarComJanela(
    chave: string,
    janelaSegundos: number
  ): Promise<ResultadoIncremento> {
    const [contagem, ttl] = await this.redis.eval<[number], [number, number]>(
      SCRIPT_INCREMENTO_COM_JANELA,
      [chave],
      [janelaSegundos]
    );
    return { contagem, ttlSegundos: ttl < 0 ? janelaSegundos : ttl };
  }

  async obter(chave: string): Promise<string | null> {
    const valor = await this.redis.get<string>(chave);
    return valor ?? null;
  }

  async definir(chave: string, valor: string, ttlSegundos: number): Promise<void> {
    await this.redis.set(chave, valor, { ex: ttlSegundos });
  }

  async remover(chave: string): Promise<void> {
    await this.redis.del(chave);
  }

  async ttl(chave: string): Promise<number> {
    const restante = await this.redis.ttl(chave);
    return restante > 0 ? restante : 0;
  }
}

let instancia: KvStore | null | undefined;

// `null` = Upstash não configurado (env vars ausentes). Quem chama trata
// isso como "rate limiting indisponível agora" e segue liberando a
// requisição (fail-open) — melhor deixar passar do que derrubar
// login/formulário/upload por causa de uma dependência externa fora do ar
// ou ainda não configurada. O aviso no console garante que isso não passe
// despercebido.
export function obterKvStore(): KvStore | null {
  if (instancia !== undefined) return instancia;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    logger.warn("Rate limiting desativado: defina UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN", {
      modulo: "rate-limit",
    });
    instancia = null;
    return null;
  }

  instancia = new UpstashKvStore(new Redis({ url, token }));
  return instancia;
}
