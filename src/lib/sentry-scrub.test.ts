import { describe, test, expect } from "vitest";
import type { Event as SentryEvent } from "@sentry/nextjs";
import { limparEventoSentry } from "@/lib/sentry-scrub";

function evento(parcial: Partial<SentryEvent>): SentryEvent {
  return parcial as SentryEvent;
}

describe("limparEventoSentry — CPF", () => {
  test("remove CPF por completo do texto de uma mensagem de exceção", () => {
    const e = evento({
      exception: { values: [{ value: "Falha ao validar CPF 529.982.247-25 do cliente" }] },
    });
    limparEventoSentry(e);
    const texto = e.exception!.values![0].value!;
    expect(texto).not.toContain("529.982.247-25");
    expect(texto).toContain("[cpf-filtrado]");
  });

  test("remove CPF sem máscara também", () => {
    const e = evento({ message: "cpf invalido: 52998224725" });
    limparEventoSentry(e);
    expect(e.message).not.toContain("52998224725");
    expect(e.message).toContain("[cpf-filtrado]");
  });
});

describe("limparEventoSentry — telefone (mascarado, não removido por completo)", () => {
  test("mantém só os últimos 4 dígitos", () => {
    const e = evento({ message: "contato: (11) 91234-5678" });
    limparEventoSentry(e);
    expect(e.message).not.toContain("91234-5678");
    expect(e.message).not.toContain("(11) 91234");
    expect(e.message).toContain("5678");
  });
});

describe("limparEventoSentry — e-mail (mascarado, não removido por completo)", () => {
  test("mantém domínio e primeira letra, esconde o resto do local-part", () => {
    const e = evento({ message: "lead: joao.silva@example.com quer visitar" });
    limparEventoSentry(e);
    expect(e.message).not.toContain("joao.silva@example.com");
    expect(e.message).toContain("@example.com");
    expect(e.message).toContain("j***@example.com");
  });
});

describe("limparEventoSentry — senha/token/cookie/Authorization (removidos por completo, nunca mascarados)", () => {
  test("chave 'senha' em extra vira [filtrado] mesmo aninhada", () => {
    const e = evento({ extra: { dados: { nome: "Fulano", senha: "abc123" } } });
    limparEventoSentry(e);
    expect((e.extra!.dados as Record<string, unknown>).senha).toBe("[filtrado]");
    expect((e.extra!.dados as Record<string, unknown>).nome).toBe("Fulano");
  });

  test("header authorization e cookie viram [filtrado]; outros headers sobrevivem", () => {
    const e = evento({
      request: {
        headers: { Authorization: "Bearer segredo", Cookie: "session=xyz", "User-Agent": "vitest" },
      },
    });
    limparEventoSentry(e);
    expect(e.request!.headers!.Authorization).toBe("[filtrado]");
    expect(e.request!.headers!.Cookie).toBe("[filtrado]");
    expect(e.request!.headers!["User-Agent"]).toBe("vitest");
  });

  test("request.cookies e request.data são removidos por completo", () => {
    const e = evento({
      request: { cookies: { session: "xyz" }, data: { senha: "abc", nome: "Fulano" } },
    });
    limparEventoSentry(e);
    expect(e.request!.cookies).toBeUndefined();
    expect(e.request!.data).toBeUndefined();
  });

  test("token em query string vira [filtrado]", () => {
    const e = evento({ request: { query_string: "token=abc123&page=2" } });
    limparEventoSentry(e);
    expect(e.request!.query_string).not.toContain("abc123");
    expect(e.request!.query_string).toContain("page=2");
  });
});

describe("limparEventoSentry — mensagens/notas nunca enviadas por inteiro", () => {
  test("chave 'mensagem' em extra vira [filtrado]", () => {
    const e = evento({ extra: { mensagem: "Quero visitar o imóvel amanhã às 15h" } });
    limparEventoSentry(e);
    expect(e.extra!.mensagem).toBe("[filtrado]");
  });
});

describe("limparEventoSentry — query string mascarada seletivamente", () => {
  test("mascara chave sensível mas preserva paginação/filtros comuns", () => {
    const e = evento({
      request: { url: "https://x.test/app/clientes?email=joao@example.com&page=2&pageSize=20" },
    });
    limparEventoSentry(e);
    const url = new URL(e.request!.url!);
    expect(url.searchParams.get("email")).not.toBe("joao@example.com");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("20");
  });

  test("query_string como array de pares também é mascarado", () => {
    const e = evento({
      request: { query_string: [["cpf", "52998224725"], ["page", "1"]] },
    });
    limparEventoSentry(e);
    const pares = e.request!.query_string as Array<[string, string]>;
    expect(pares.find(([k]) => k === "cpf")?.[1]).toBe("[filtrado]");
    expect(pares.find(([k]) => k === "page")?.[1]).toBe("1");
  });
});

describe("limparEventoSentry — usuário só mantém id técnico", () => {
  test("email/username/ip_address são descartados, id sobrevive", () => {
    const e = evento({
      user: { id: "org-member-123", email: "joao@example.com", username: "joao", ip_address: "1.2.3.4" },
    });
    limparEventoSentry(e);
    expect(e.user).toEqual({ id: "org-member-123" });
  });

  test("sem id, o objeto user inteiro é descartado", () => {
    const e = evento({ user: { email: "joao@example.com" } });
    limparEventoSentry(e);
    expect(e.user).toBeUndefined();
  });
});

describe("limparEventoSentry — breadcrumbs", () => {
  test("mensagem e data do breadcrumb passam pelo mesmo mascaramento", () => {
    const e = evento({
      breadcrumbs: [
        {
          message: "cliente ligou, telefone (11) 98888-7777",
          data: { senha: "abc", email: "x@example.com" },
        },
      ],
    });
    limparEventoSentry(e);
    const migalha = e.breadcrumbs![0];
    expect(migalha.message).not.toContain("98888-7777");
    expect((migalha.data as Record<string, unknown>).senha).toBe("[filtrado]");
  });
});

describe("limparEventoSentry — stack frame vars (defesa em profundidade)", () => {
  test("variáveis locais sensíveis capturadas na stack trace são filtradas", () => {
    const e = evento({
      exception: {
        values: [
          {
            value: "erro genérico",
            stacktrace: {
              frames: [{ vars: { senha: "abc123", nome: "Fulano" } }],
            },
          },
        ],
      },
    });
    limparEventoSentry(e);
    const vars = e.exception!.values![0].stacktrace!.frames![0].vars as Record<string, unknown>;
    expect(vars.senha).toBe("[filtrado]");
    expect(vars.nome).toBe("Fulano");
  });
});

describe("limparEventoSentry — contexts", () => {
  test("contexto técnico conhecido (runtime/os/app) não é tocado", () => {
    const e = evento({ contexts: { runtime: { name: "node", version: "22.16.0" } } });
    limparEventoSentry(e);
    expect(e.contexts!.runtime).toEqual({ name: "node", version: "22.16.0" });
  });

  test("contexto customizado desconhecido passa pelo mascaramento", () => {
    const e = evento({ contexts: { formulario: { email: "joao@example.com" } } });
    limparEventoSentry(e);
    expect((e.contexts!.formulario as Record<string, unknown>).email).not.toBe("joao@example.com");
  });
});

describe("limparEventoSentry — dados não sensíveis permanecem intactos", () => {
  test("organizationId, userId, route, action, modulo não são alterados", () => {
    const e = evento({
      tags: { organizationId: "org-abc", userId: "user-123", route: "/app/imoveis", modulo: "properties" },
    });
    const original = { ...e.tags };
    limparEventoSentry(e);
    expect(e.tags).toEqual(original);
  });
});
