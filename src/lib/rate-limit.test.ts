import { describe, test, expect } from "vitest";
import type { KvStore, ResultadoIncremento } from "@/lib/kv-store";
import {
  verificarLimiteFormulario,
  verificarLimiteUpload,
  verificarBloqueioLogin,
  registrarFalhaLogin,
  registrarSucessoLogin,
  normalizarContato,
  normalizarEmail,
  LIMITES,
} from "@/lib/rate-limit";
import { cabecalhosLimiteExcedido } from "@/lib/rate-limit-response";
import { obterIpCliente } from "@/lib/client-ip";

// Fake em memória do KvStore — SÓ para teste, com relógio controlável
// (nunca real Date.now()) pra testar expiração de janela sem esperar de
// verdade. Isso não é "rate limiting em memória" na aplicação: em
// produção o único KvStore usado é o UpstashKvStore (kv-store.ts); este
// fake nunca é importado fora de testes.
class MemoryKvStore implements KvStore {
  private dados = new Map<string, { valor: string; expiraEm: number }>();
  constructor(private agora: () => number = Date.now) {}

  private limpar(chave: string) {
    const item = this.dados.get(chave);
    if (item && item.expiraEm <= this.agora()) this.dados.delete(chave);
  }

  async incrementarComJanela(chave: string, janelaSegundos: number): Promise<ResultadoIncremento> {
    this.limpar(chave);
    const item = this.dados.get(chave);
    if (!item) {
      const expiraEm = this.agora() + janelaSegundos * 1000;
      this.dados.set(chave, { valor: "1", expiraEm });
      return { contagem: 1, ttlSegundos: janelaSegundos };
    }
    const novaContagem = Number(item.valor) + 1;
    this.dados.set(chave, { valor: String(novaContagem), expiraEm: item.expiraEm });
    return {
      contagem: novaContagem,
      ttlSegundos: Math.max(0, Math.ceil((item.expiraEm - this.agora()) / 1000)),
    };
  }

  async obter(chave: string): Promise<string | null> {
    this.limpar(chave);
    return this.dados.get(chave)?.valor ?? null;
  }

  async definir(chave: string, valor: string, ttlSegundos: number): Promise<void> {
    this.dados.set(chave, { valor, expiraEm: this.agora() + ttlSegundos * 1000 });
  }

  async remover(chave: string): Promise<void> {
    this.dados.delete(chave);
  }

  async ttl(chave: string): Promise<number> {
    this.limpar(chave);
    const item = this.dados.get(chave);
    if (!item) return 0;
    return Math.max(0, Math.ceil((item.expiraEm - this.agora()) / 1000));
  }
}

function criarRelogio(inicialMs = 0) {
  let agora = inicialMs;
  return {
    agora: () => agora,
    avancar(segundos: number) {
      agora += segundos * 1000;
    },
  };
}

describe("verificarLimiteFormulario — limite por IP", () => {
  test("bloqueia a 6ª submissão do mesmo IP dentro da janela curta (limite 5)", async () => {
    const store = new MemoryKvStore();
    const params = {
      formulario: "contato" as const,
      ip: "203.0.113.10",
      organizationId: "org-1",
      contatoNormalizado: "",
    };

    for (let i = 0; i < LIMITES.formularioCurto.limite; i++) {
      const r = await verificarLimiteFormulario(store, params);
      expect(r.permitido).toBe(true);
    }

    const sexta = await verificarLimiteFormulario(store, params);
    expect(sexta.permitido).toBe(false);
    if (!sexta.permitido) {
      expect(sexta.motivo).toBe("ip_curto");
      expect(sexta.retryAfterSegundos > 0).toBeTruthy();
    }
  });

  test("IPs diferentes têm contadores independentes", async () => {
    const store = new MemoryKvStore();
    // organizationId diferente em cada IP pra isolar só a dimensão "IP"
    // (a dimensão "organização" tem seu próprio teste em "Isolamento entre organizações").
    for (let i = 0; i < LIMITES.formularioCurto.limite; i++) {
      await verificarLimiteFormulario(store, {
        formulario: "contato",
        ip: "203.0.113.10",
        organizationId: "org-1",
        contatoNormalizado: "",
      });
    }
    // IP que já estourou continua bloqueado...
    const r1 = await verificarLimiteFormulario(store, {
      formulario: "contato",
      ip: "203.0.113.10",
      organizationId: "org-1",
      contatoNormalizado: "",
    });
    expect(r1.permitido).toBe(false);
    // ...mas um IP novo (organização diferente, pra não esbarrar no limite por org) não é afetado.
    const r2 = await verificarLimiteFormulario(store, {
      formulario: "contato",
      ip: "198.51.100.20",
      organizationId: "org-2",
      contatoNormalizado: "",
    });
    expect(r2.permitido).toBe(true);
  });
});

describe("Login — limite por e-mail", () => {
  test("bloqueia após 5 falhas para o mesmo e-mail, independente de maiúsculas/minúsculas", async () => {
    const store = new MemoryKvStore();
    const ip = "203.0.113.99"; // fixo — o que varia aqui é só o e-mail
    // tentativas + 1: o limite só é ultrapassado na 6ª falha (contagem > limite).
    for (let i = 0; i <= LIMITES.login.tentativas; i++) {
      await registrarFalhaLogin(store, { ip, email: "Usuario@Example.com" });
    }
    const bloqueio = await verificarBloqueioLogin(store, { ip, email: "usuario@example.com" });
    expect(bloqueio.permitido).toBe(false);
    if (!bloqueio.permitido) {
      expect(bloqueio.motivo).toBe("bloqueio_login");
      expect(bloqueio.retryAfterSegundos > 0).toBeTruthy();
    }
  });

  test("e-mails diferentes não compartilham o contador de falhas", async () => {
    const store = new MemoryKvStore();
    for (let i = 0; i <= LIMITES.login.tentativas; i++) {
      await registrarFalhaLogin(store, { ip: "203.0.113.1", email: "vitima@example.com" });
    }
    // O IP do atacante mudou (proxy/rede diferente) mas insiste no mesmo e-mail:
    const bloqueioMesmoEmail = await verificarBloqueioLogin(store, {
      ip: "198.51.100.1",
      email: "vitima@example.com",
    });
    expect(bloqueioMesmoEmail.permitido).toBe(false);

    // IP novo (o mesmo IP de antes já está com a dimensão "ip" bloqueada,
    // o que é o comportamento correto — aqui queremos isolar só a
    // dimensão "e-mail").
    const outroEmail = await verificarBloqueioLogin(store, {
      ip: "198.51.100.2",
      email: "outrapessoa@example.com",
    });
    expect(outroEmail.permitido).toBe(true);
  });

  test("login bem-sucedido reseta o contador de falhas", async () => {
    const store = new MemoryKvStore();
    const params = { ip: "203.0.113.5", email: "usuario@example.com" };
    for (let i = 0; i < LIMITES.login.tentativas - 1; i++) {
      await registrarFalhaLogin(store, params);
    }
    await registrarSucessoLogin(store, params);
    // Mais 4 falhas depois do reset não deveriam, sozinhas, estourar o limite de 5.
    for (let i = 0; i < LIMITES.login.tentativas - 1; i++) {
      await registrarFalhaLogin(store, params);
    }
    const bloqueio = await verificarBloqueioLogin(store, params);
    expect(bloqueio.permitido).toBe(true);
  });

  test("bloqueio progressivo: a 2ª vez que o limite estoura, o bloqueio é mais longo que a 1ª", async () => {
    const relogio = criarRelogio();
    const store = new MemoryKvStore(relogio.agora);
    const params = { ip: "203.0.113.7", email: null };

    for (let i = 0; i <= LIMITES.login.tentativas; i++) {
      await registrarFalhaLogin(store, params);
    }
    const primeiroBloqueio = await verificarBloqueioLogin(store, params);
    expect(primeiroBloqueio.permitido).toBe(false);
    const primeiraDuracao = !primeiroBloqueio.permitido ? primeiroBloqueio.retryAfterSegundos : 0;
    expect(primeiraDuracao).toBe(LIMITES.loginNiveisBloqueioSegundos[0]);

    // Passa o tempo do primeiro bloqueio (mas não da janela de violações de 24h).
    relogio.avancar(LIMITES.loginNiveisBloqueioSegundos[0] + 1);
    for (let i = 0; i <= LIMITES.login.tentativas; i++) {
      await registrarFalhaLogin(store, params);
    }
    const segundoBloqueio = await verificarBloqueioLogin(store, params);
    expect(segundoBloqueio.permitido).toBe(false);
    const segundaDuracao = !segundoBloqueio.permitido ? segundoBloqueio.retryAfterSegundos : 0;
    expect(segundaDuracao).toBe(LIMITES.loginNiveisBloqueioSegundos[1]);
    expect(segundaDuracao > primeiraDuracao).toBeTruthy();
  });
});

describe("Expiração da janela", () => {
  test("o contador de formulário libera de novo depois que a janela expira", async () => {
    const relogio = criarRelogio();
    const store = new MemoryKvStore(relogio.agora);
    const params = {
      formulario: "anuncie" as const,
      ip: "203.0.113.50",
      organizationId: "org-1",
      contatoNormalizado: "",
    };

    for (let i = 0; i < LIMITES.formularioCurto.limite; i++) {
      await verificarLimiteFormulario(store, params);
    }
    const bloqueado = await verificarLimiteFormulario(store, params);
    expect(bloqueado.permitido).toBe(false);

    relogio.avancar(LIMITES.formularioCurto.janelaSegundos + 1);
    const liberado = await verificarLimiteFormulario(store, params);
    expect(liberado.permitido).toBe(true);
  });

  test("bloqueio de login expira sozinho após a duração calculada", async () => {
    const relogio = criarRelogio();
    const store = new MemoryKvStore(relogio.agora);
    const params = { ip: "203.0.113.60", email: null };

    for (let i = 0; i <= LIMITES.login.tentativas; i++) {
      await registrarFalhaLogin(store, params);
    }
    expect((await verificarBloqueioLogin(store, params)).permitido).toBe(false);

    relogio.avancar(LIMITES.loginNiveisBloqueioSegundos[0] + 1);
    expect((await verificarBloqueioLogin(store, params)).permitido).toBe(true);
  });
});

describe("Isolamento entre organizações", () => {
  test("o limite de uma organização não afeta outra, mesmo com o mesmo IP", async () => {
    const store = new MemoryKvStore();
    const ipCompartilhado = "203.0.113.77"; // ex: duas empresas atrás do mesmo proxy/rede

    for (let i = 0; i < LIMITES.formularioCurto.limite; i++) {
      await verificarLimiteFormulario(store, {
        formulario: "contato",
        ip: ipCompartilhado,
        organizationId: "org-A",
        contatoNormalizado: "pessoa-a@example.com",
      });
    }
    const orgABloqueada = await verificarLimiteFormulario(store, {
      formulario: "contato",
      ip: "198.51.100.1", // IP diferente, só a dimensão "organização" em foco
      organizationId: "org-A",
      contatoNormalizado: "outra-pessoa@example.com",
    });
    expect(orgABloqueada.permitido).toBe(false);

    const orgBLiberada = await verificarLimiteFormulario(store, {
      formulario: "contato",
      ip: "198.51.100.2",
      organizationId: "org-B",
      contatoNormalizado: "pessoa-b@example.com",
    });
    expect(orgBLiberada.permitido).toBe(true);
  });

  test("upload: organizações diferentes têm orçamento de upload independente", async () => {
    const store = new MemoryKvStore();
    for (let i = 0; i < LIMITES.uploadPorOrganizacao.limite; i++) {
      await verificarLimiteUpload(store, {
        organizationMemberId: `membro-org-A-${i}`,
        organizationId: "org-A",
      });
    }
    const orgAEstourada = await verificarLimiteUpload(store, {
      organizationMemberId: "membro-org-A-extra",
      organizationId: "org-A",
    });
    expect(orgAEstourada.permitido).toBe(false);

    const orgBLivre = await verificarLimiteUpload(store, {
      organizationMemberId: "membro-org-B-1",
      organizationId: "org-B",
    });
    expect(orgBLivre.permitido).toBe(true);
  });
});

describe("Resposta 429 com Retry-After", () => {
  test("cabecalhosLimiteExcedido sempre retorna Retry-After >= 1", () => {
    expect(cabecalhosLimiteExcedido(42)["Retry-After"]).toBe("42");
    expect(cabecalhosLimiteExcedido(0)["Retry-After"]).toBe("1");
    expect(cabecalhosLimiteExcedido(-5)["Retry-After"]).toBe("1");
  });

  test("resultado bloqueado de upload carrega retryAfterSegundos utilizável no header", async () => {
    const store = new MemoryKvStore();
    for (let i = 0; i < LIMITES.uploadPorUsuario.limite; i++) {
      await verificarLimiteUpload(store, { organizationMemberId: "membro-1", organizationId: "org-1" });
    }
    const resultado = await verificarLimiteUpload(store, {
      organizationMemberId: "membro-1",
      organizationId: "org-1",
    });
    expect(resultado.permitido).toBe(false);
    if (!resultado.permitido) {
      const headers = cabecalhosLimiteExcedido(resultado.retryAfterSegundos);
      expect(Number(headers["Retry-After"]) > 0).toBeTruthy();
    }
  });
});

describe("Usuário legítimo dentro do limite", () => {
  test("uploads abaixo do limite nunca são bloqueados", async () => {
    const store = new MemoryKvStore();
    for (let i = 0; i < LIMITES.uploadPorUsuario.limite; i++) {
      const r = await verificarLimiteUpload(store, {
        organizationMemberId: "membro-legitimo",
        organizationId: "org-1",
      });
      expect(r.permitido).toBe(true);
    }
  });

  test("login legítimo (poucas tentativas, alternando erro e acerto) nunca é bloqueado", async () => {
    const store = new MemoryKvStore();
    const params = { ip: "203.0.113.200", email: "pessoa@example.com" };
    await registrarFalhaLogin(store, params); // esqueceu a senha uma vez
    await registrarSucessoLogin(store, params); // acertou na 2ª tentativa
    const bloqueio = await verificarBloqueioLogin(store, params);
    expect(bloqueio.permitido).toBe(true);
  });
});

describe("normalizarContato / normalizarEmail", () => {
  test("prioriza e-mail normalizado quando presente", () => {
    expect(normalizarContato(" Pessoa@Example.com ", "11999998888")).toBe("pessoa@example.com");
  });

  test("usa telefone só com dígitos quando não há e-mail", () => {
    expect(normalizarContato("", "(11) 99999-8888")).toBe("11999998888");
  });

  test("retorna string vazia quando não há nem e-mail nem telefone", () => {
    expect(normalizarContato(null, null)).toBe("");
  });

  test("normalizarEmail baixa a caixa e remove espaços", () => {
    expect(normalizarEmail("  Fulano@Exemplo.COM  ")).toBe("fulano@exemplo.com");
  });
});

describe("obterIpCliente", () => {
  test("prioriza do-connecting-ip (header confiável da DigitalOcean)", () => {
    const headers = new Headers({
      "do-connecting-ip": "203.0.113.5",
      "x-forwarded-for": "1.2.3.4",
    });
    expect(obterIpCliente(headers)).toBe("203.0.113.5");
  });

  test("cai para o último valor de x-forwarded-for quando do-connecting-ip está ausente", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(obterIpCliente(headers)).toBe("5.6.7.8");
  });

  test("retorna um valor fixo quando nenhum header confiável está presente", () => {
    const headers = new Headers();
    expect(obterIpCliente(headers)).toBe("desconhecido");
  });

  test("ignora valores com formato claramente inválido", () => {
    const headers = new Headers({ "do-connecting-ip": "'; DROP TABLE users;--" });
    expect(obterIpCliente(headers)).toBe("desconhecido");
  });
});
