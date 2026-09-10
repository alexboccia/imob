import { describe, expect, test } from "vitest";
import {
  caminhoPerfilCorretor,
  contatosPublicosDoCorretor,
  emailPublicoDoCorretor,
  hrefEmail,
  hrefTelefone,
  resolverCorretorPublico,
  resolverWhatsAppDoImovel,
  telefonePublicoDoCorretor,
  whatsappPublicoDoCorretor,
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
  publicPhone: "11933332222",
  publicEmail: "maria@imobiliaria.test",
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
      publicPhone: null,
      publicEmail: null,
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

// =====================================================================
// whatsappPublicoDoCorretor — o botão que fica ao lado do rosto
// =====================================================================
// A diferença entre esta função e resolverWhatsAppDoImovel é a razão de
// ela existir: aquela pode cair no número institucional, esta nunca.
describe("whatsappPublicoDoCorretor — número da PESSOA, nunca da imobiliária", () => {
  test("perfil publicado com número próprio: devolve o número dele", () => {
    expect(whatsappPublicoDoCorretor(MEMBRO_PUBLICADO)).toBe("11977776666");
  });

  test("sem opt-in não devolve nada, mesmo com número preenchido", () => {
    expect(whatsappPublicoDoCorretor(MEMBRO_COMPLETO_SEM_OPTIN)).toBeNull();
  });

  test("publicado SEM número próprio: null — e é isso que apaga o botão", () => {
    // O contraste com resolverWhatsAppDoImovel é o ponto do teste: lá o
    // mesmo membro cairia no número institucional; aqui, não. Um botão
    // ao lado da foto de alguém que abre conversa com outro número
    // afirmaria uma coisa que não é verdade.
    const semNumero = { ...MEMBRO_PUBLICADO!, publicWhatsapp: null };
    expect(whatsappPublicoDoCorretor(semNumero)).toBeNull();
    expect(resolverWhatsAppDoImovel(semNumero, "11988887777")).toBe("11988887777");
  });

  test("número inválido é tratado como ausente", () => {
    for (const invalido of ["", "   ", "123", "abc"]) {
      expect(
        whatsappPublicoDoCorretor({ ...MEMBRO_PUBLICADO!, publicWhatsapp: invalido })
      ).toBeNull();
    }
  });

  test("membro ausente ou nulo não quebra", () => {
    expect(whatsappPublicoDoCorretor(null)).toBeNull();
    expect(whatsappPublicoDoCorretor(undefined)).toBeNull();
  });
});

describe("caminhoPerfilCorretor — um lugar só monta a URL do perfil", () => {
  test("organização com prefixo de caminho", () => {
    expect(caminhoPerfilCorretor("/imob-abc", "cmb123")).toBe("/imob-abc/corretores/cmb123");
  });

  test("organização principal (basePath vazio) não gera barra dupla", () => {
    expect(caminhoPerfilCorretor("", "cmb123")).toBe("/corretores/cmb123");
  });

  test("o identificador entra como veio — quem valida o tenant é a query da rota", () => {
    // O caminho é só texto: a garantia de isolamento não está aqui e sim
    // no `where` da página, que casa id E organizationId. Fixar isso
    // evita alguém "endurecer" o helper e achar que fechou o IDOR.
    expect(caminhoPerfilCorretor("/org-a", "id-de-outra-org")).toBe(
      "/org-a/corretores/id-de-outra-org"
    );
  });
});

// =====================================================================
// Contatos públicos — telefone e e-mail
// =====================================================================
describe("telefone e e-mail públicos exigem o mesmo opt-in", () => {
  test("publicado: devolve os dois", () => {
    expect(telefonePublicoDoCorretor(MEMBRO_PUBLICADO)).toBe("11933332222");
    expect(emailPublicoDoCorretor(MEMBRO_PUBLICADO)).toBe("maria@imobiliaria.test");
  });

  test("sem opt-in não devolve nada, mesmo com os campos preenchidos", () => {
    expect(telefonePublicoDoCorretor(MEMBRO_COMPLETO_SEM_OPTIN)).toBeNull();
    expect(emailPublicoDoCorretor(MEMBRO_COMPLETO_SEM_OPTIN)).toBeNull();
  });

  test("campo vazio é ausência — é o que apaga o botão", () => {
    const semContatos = { ...MEMBRO_PUBLICADO!, publicPhone: null, publicEmail: null };
    expect(telefonePublicoDoCorretor(semContatos)).toBeNull();
    expect(emailPublicoDoCorretor(semContatos)).toBeNull();
    expect(emailPublicoDoCorretor({ ...MEMBRO_PUBLICADO!, publicEmail: "   " })).toBeNull();
  });

  test("telefone inválido é tratado como ausente, não vira link quebrado", () => {
    for (const invalido of ["", "123", "abc", "119999"]) {
      expect(
        telefonePublicoDoCorretor({ ...MEMBRO_PUBLICADO!, publicPhone: invalido })
      ).toBeNull();
    }
  });

  test("telefone aceita formatação e devolve só dígitos locais", () => {
    expect(
      telefonePublicoDoCorretor({ ...MEMBRO_PUBLICADO!, publicPhone: "(11) 93333-2222" })
    ).toBe("11933332222");
  });

  test("telefone e WhatsApp têm normalizações DIFERENTES, de propósito", () => {
    // O WhatsApp guarda DDI porque wa.me exige; o telefone guarda o
    // número local porque é o que telefoneValido define. Misturar os dois
    // produziria link quebrado em um dos lados.
    const membro = {
      ...MEMBRO_PUBLICADO!,
      publicWhatsapp: "5511977776666",
      publicPhone: "11933332222",
    };
    expect(whatsappPublicoDoCorretor(membro)).toBe("5511977776666");
    expect(telefonePublicoDoCorretor(membro)).toBe("11933332222");
  });

  test("contatosPublicosDoCorretor entrega os três de uma vez", () => {
    expect(contatosPublicosDoCorretor(MEMBRO_PUBLICADO)).toEqual({
      telefone: "11933332222",
      email: "maria@imobiliaria.test",
      whatsapp: "11977776666",
    });
    expect(contatosPublicosDoCorretor(MEMBRO_COMPLETO_SEM_OPTIN)).toEqual({
      telefone: null,
      email: null,
      whatsapp: null,
    });
  });

  test("hrefs: tel: sem DDI inventado e mailto: sem query string", () => {
    expect(hrefTelefone("11933332222")).toBe("tel:11933332222");
    expect(hrefTelefone(null)).toBeNull();
    // Nada de ?subject=/?body=: query de mailto é lugar público demais
    // para qualquer conteúdo.
    expect(hrefEmail("maria@imobiliaria.test")).toBe("mailto:maria@imobiliaria.test");
    expect(hrefEmail(null)).toBeNull();
  });
});
