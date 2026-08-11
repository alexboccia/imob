import { describe, test, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarCenario } from "@/test/fixtures";

// criarPessoa (src/app/app/clientes/actions.ts) importa @/lib/auth
// diretamente — mesma limitação de resolução de módulo já documentada
// nesta sessão (next-auth → next/server não resolve sob Vitest puro).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

// No caminho de sucesso (primeira Person, sem colisão), criarPessoa chama
// revalidatePath (exige o request store do runtime do Next — mesma
// limitação já documentada) e depois redirect (que lança um erro de
// controle de fluxo mesmo fora do runtime do Next, já que não depende de
// nenhum contexto ambiente pra saber pra onde redirecionar). Ambos
// mockados só pra viabilizar o teste — o caminho que este arquivo audita
// é o de REJEIÇÃO (P2002), que nunca chega a essas duas chamadas.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@/lib/auth";
import { criarPessoa } from "@/app/app/clientes/actions";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(fields)) fd.set(chave, valor);
  return fd;
}

function autenticarComo(cenario: {
  organization: { id: string };
  membro: { id: string };
  usuario: { id: string };
}) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: cenario.usuario.id,
      organizationId: cenario.organization.id,
      organizationMemberId: cenario.membro.id,
      role: "OWNER",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe("criarPessoa (cadastro manual) — colisão com dedup nunca vira 500", () => {
  let cenario: Awaited<ReturnType<typeof criarCenario>> | undefined;

  afterEach(async () => {
    vi.mocked(auth).mockReset();
    if (cenario) await cenario.destruir();
    cenario = undefined;
  });

  test("N) e-mail já usado por outra Person na mesma organização é rejeitado com erro controlado, não 500", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);

    await criarPessoa(
      { sucesso: false },
      formData({ nome: "Primeira Pessoa", email: "duplicado@email.com", papel: "LEAD" })
    );

    const resultado = await criarPessoa(
      { sucesso: false },
      formData({ nome: "Segunda Pessoa", email: "DUPLICADO@EMAIL.COM", papel: "LEAD" })
    );

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toBeTruthy();

    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
  });

  test("O) telefone já usado por outra Person na mesma organização é rejeitado com erro controlado, não 500", async () => {
    cenario = await criarCenario({ modulos: ["core", "properties", "crm"] });
    autenticarComo(cenario);

    await criarPessoa(
      { sucesso: false },
      formData({ nome: "Primeira Pessoa", telefone: "11999998888", papel: "LEAD" })
    );

    const resultado = await criarPessoa(
      { sucesso: false },
      formData({ nome: "Segunda Pessoa", telefone: "(11) 99999-8888", papel: "LEAD" })
    );

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toBeTruthy();

    const total = await prisma.person.count({ where: { organizationId: cenario.organization.id } });
    expect(total).toBe(1);
  });
});
