import { describe, expect, test } from "vitest";
import {
  resolverCorretorPublico,
  resolverWhatsAppDoImovel,
  type MembroResponsavel,
} from "./perfil-publico-corretor";

// Membro com TODOS os dados comerciais preenchidos, mas sem opt-in — o
// caso que mais importa: dado preenchido nunca é o mesmo que dado
// autorizado.
const MEMBRO_COMPLETO_SEM_OPTIN: MembroResponsavel = {
  publicProfileEnabled: false,
  publicCreci: "CRECI 54.952-F",
  publicPhotoUrl: "https://cdn.example/foto.jpg",
  publicBio: "Atuo na região há anos.",
  publicWhatsapp: "11977776666",
  user: { name: "Maria Silva" },
};

const MEMBRO_PUBLICADO: MembroResponsavel = {
  ...MEMBRO_COMPLETO_SEM_OPTIN!,
  publicProfileEnabled: true,
};

describe("resolverCorretorPublico — publicação é opt-in", () => {
  test("sem membro responsável, não há profissional público", () => {
    expect(resolverCorretorPublico(null)).toBeNull();
    expect(resolverCorretorPublico(undefined)).toBeNull();
  });

  test("perfil DESABILITADO não publica, mesmo com todos os dados preenchidos", () => {
    expect(resolverCorretorPublico(MEMBRO_COMPLETO_SEM_OPTIN)).toBeNull();
  });

  test("perfil habilitado publica os dados comerciais", () => {
    const c = resolverCorretorPublico(MEMBRO_PUBLICADO)!;
    expect(c.nome).toBe("Maria Silva");
    expect(c.creci).toBe("CRECI 54.952-F");
    expect(c.foto).toBe("https://cdn.example/foto.jpg");
    expect(c.bio).toBe("Atuo na região há anos.");
  });

  test("habilitado com só o nome: publica sem CRECI/foto/bio, que são opcionais", () => {
    const c = resolverCorretorPublico({
      publicProfileEnabled: true,
      publicCreci: null,
      publicPhotoUrl: null,
      publicBio: null,
      publicWhatsapp: null,
      user: { name: "João Souza" },
    })!;
    expect(c.nome).toBe("João Souza");
    expect(c.creci).toBeNull();
    expect(c.foto).toBeNull();
    expect(c.bio).toBeNull();
  });

  test("campos só com espaço viram null, nunca uma linha vazia no card", () => {
    const c = resolverCorretorPublico({
      ...MEMBRO_PUBLICADO!,
      publicCreci: "   ",
      publicBio: "\n  ",
      publicPhotoUrl: " ",
    })!;
    expect(c.creci).toBeNull();
    expect(c.bio).toBeNull();
    expect(c.foto).toBeNull();
  });

  test("sem nome utilizável não publica — card com CRECI e sem nome seria pior que nenhum", () => {
    expect(
      resolverCorretorPublico({ ...MEMBRO_PUBLICADO!, user: { name: "   " } })
    ).toBeNull();
  });

  // A função recebe só os campos public* + user.name. Não existe caminho
  // pelo qual e-mail de login ou contato operacional cheguem à renderização.
  test("o resultado carrega só campos comerciais — nunca e-mail ou contato interno", () => {
    const c = resolverCorretorPublico(MEMBRO_PUBLICADO)!;
    expect(Object.keys(c).sort()).toEqual(["bio", "creci", "foto", "nome"]);
  });
});

describe("resolverWhatsAppDoImovel — profissional, institucional ou nenhum", () => {
  const INSTITUCIONAL = "1133334444";

  test("corretor publicado com WhatsApp público: usa o do profissional", () => {
    expect(resolverWhatsAppDoImovel(MEMBRO_PUBLICADO, INSTITUCIONAL)).toBe("11977776666");
  });

  test("corretor publicado SEM WhatsApp público: cai no institucional", () => {
    expect(
      resolverWhatsAppDoImovel({ ...MEMBRO_PUBLICADO!, publicWhatsapp: null }, INSTITUCIONAL)
    ).toBe(INSTITUCIONAL);
  });

  test("perfil não publicado NUNCA usa o WhatsApp do membro, nem o público", () => {
    expect(resolverWhatsAppDoImovel(MEMBRO_COMPLETO_SEM_OPTIN, INSTITUCIONAL)).toBe(
      INSTITUCIONAL
    );
  });

  test("sem membro responsável: institucional", () => {
    expect(resolverWhatsAppDoImovel(null, INSTITUCIONAL)).toBe(INSTITUCIONAL);
  });

  test("nenhum número em lugar nenhum: null, e a página não renderiza CTA", () => {
    expect(resolverWhatsAppDoImovel(null, null)).toBeNull();
    expect(resolverWhatsAppDoImovel(MEMBRO_COMPLETO_SEM_OPTIN, "")).toBeNull();
  });

  test("número público incompleto não vale — cai no institucional", () => {
    expect(
      resolverWhatsAppDoImovel({ ...MEMBRO_PUBLICADO!, publicWhatsapp: "119" }, INSTITUCIONAL)
    ).toBe(INSTITUCIONAL);
  });
});
