import { describe, test, expect, afterEach } from "vitest";
import type { KvStore, ResultadoIncremento } from "@/lib/kv-store";
import { verificarLimiteFormulario, LIMITES } from "@/lib/rate-limit";
import { criarCenario } from "@/test/fixtures";

// Mesmo double documentado em src/lib/rate-limit.test.ts — só pra teste,
// nunca usado em produção (lá o KvStore real é o UpstashKvStore). Repetido
// aqui (em vez de importado) porque este ambiente de teste não tem um
// Redis/Upstash real configurado (.env.test deixa UPSTASH_* vazio de
// propósito) — o que este teste de integração acrescenta sobre o unitário é
// exercitar o isolamento por organizationId usando organizações que
// realmente existem no banco de teste, não literais soltos.
class MemoryKvStore implements KvStore {
  private dados = new Map<string, { valor: string; expiraEm: number }>();

  async incrementarComJanela(chave: string, janelaSegundos: number): Promise<ResultadoIncremento> {
    const item = this.dados.get(chave);
    if (!item || item.expiraEm <= Date.now()) {
      this.dados.set(chave, { valor: "1", expiraEm: Date.now() + janelaSegundos * 1000 });
      return { contagem: 1, ttlSegundos: janelaSegundos };
    }
    const novaContagem = Number(item.valor) + 1;
    this.dados.set(chave, { valor: String(novaContagem), expiraEm: item.expiraEm });
    return { contagem: novaContagem, ttlSegundos: janelaSegundos };
  }

  async obter(chave: string): Promise<string | null> {
    return this.dados.get(chave)?.valor ?? null;
  }

  async definir(chave: string, valor: string, ttlSegundos: number): Promise<void> {
    this.dados.set(chave, { valor, expiraEm: Date.now() + ttlSegundos * 1000 });
  }

  async remover(chave: string): Promise<void> {
    this.dados.delete(chave);
  }

  async ttl(): Promise<number> {
    return 0;
  }
}

describe("Rate limiting — isolado por organizationId real do banco", () => {
  let cenarioA: Awaited<ReturnType<typeof criarCenario>> | undefined;
  let cenarioB: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    if (cenarioA) await cenarioA.destruir();
    if (cenarioB) await cenarioB.destruir();
    cenarioA = undefined;
    cenarioB = undefined;
  });

  test("organização que estourou o limite do formulário não afeta outra organização, mesmo com o mesmo IP", async () => {
    cenarioA = await criarCenario();
    cenarioB = await criarCenario();
    const store = new MemoryKvStore();
    const ip = "203.0.113.9";

    for (let i = 0; i < LIMITES.formularioCurto.limite; i++) {
      await verificarLimiteFormulario(store, {
        formulario: "contato",
        ip,
        organizationId: cenarioA.organization.id,
        contatoNormalizado: "",
      });
    }

    const bloqueadaA = await verificarLimiteFormulario(store, {
      formulario: "contato",
      ip: "198.51.100.1",
      organizationId: cenarioA.organization.id,
      contatoNormalizado: "",
    });
    expect(bloqueadaA.permitido).toBe(false);

    const liberadaB = await verificarLimiteFormulario(store, {
      formulario: "contato",
      ip: "198.51.100.2",
      organizationId: cenarioB.organization.id,
      contatoNormalizado: "",
    });
    expect(liberadaB.permitido).toBe(true);
  });
});
