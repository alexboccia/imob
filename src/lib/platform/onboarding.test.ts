import { describe, test, expect } from "vitest";
import { calcularOnboarding, type DadosOnboarding } from "@/lib/platform/onboarding";

const BASE: DadosOnboarding = {
  organizacaoExiste: true,
  planoSelecionado: true,
  ownerExiste: true,
  ownerAtivo: true,
  brandingConfigurado: false,
  dominioCustomCadastrado: false,
  dominioCustomVerificado: false,
  dominioCustomAtivo: false,
  emailDomainCadastrado: false,
  emailDomainVerificado: false,
};

function item(resultado: ReturnType<typeof calcularOnboarding>, chave: string) {
  const encontrado = resultado.itens.find((i) => i.chave === chave);
  if (!encontrado) throw new Error(`item ${chave} não encontrado`);
  return encontrado;
}

describe("calcularOnboarding — publicationStatus", () => {
  test("organização básica (sem domínio/e-mail próprios) fica PRONTO — features opcionais nunca bloqueiam", () => {
    const resultado = calcularOnboarding(BASE);
    expect(resultado.publicationStatus).toBe("PRONTO");
    expect(item(resultado, "pronta_para_publicacao").status).toBe("CONCLUIDO");
  });

  test("owner ainda não ativado (INVITED) bloqueia com PENDENTE_OWNER, mesmo com tudo mais ok", () => {
    const resultado = calcularOnboarding({ ...BASE, ownerAtivo: false });
    expect(resultado.publicationStatus).toBe("PENDENTE_OWNER");
  });

  test("domínio custom cadastrado mas não ACTIVE bloqueia com PENDENTE_DOMINIO", () => {
    const resultado = calcularOnboarding({
      ...BASE,
      dominioCustomCadastrado: true,
      dominioCustomVerificado: true,
      dominioCustomAtivo: false,
    });
    expect(resultado.publicationStatus).toBe("PENDENTE_DOMINIO");
  });

  test("domínio custom ACTIVE não bloqueia", () => {
    const resultado = calcularOnboarding({
      ...BASE,
      dominioCustomCadastrado: true,
      dominioCustomVerificado: true,
      dominioCustomAtivo: true,
    });
    expect(resultado.publicationStatus).toBe("PRONTO");
  });

  test("e-mail cadastrado mas não verificado bloqueia com PENDENTE_EMAIL", () => {
    const resultado = calcularOnboarding({ ...BASE, emailDomainCadastrado: true, emailDomainVerificado: false });
    expect(resultado.publicationStatus).toBe("PENDENTE_EMAIL");
  });

  test("e-mail verificado não bloqueia", () => {
    const resultado = calcularOnboarding({ ...BASE, emailDomainCadastrado: true, emailDomainVerificado: true });
    expect(resultado.publicationStatus).toBe("PRONTO");
  });

  test("owner pendente tem prioridade sobre domínio/e-mail pendentes (primeira checagem vence)", () => {
    const resultado = calcularOnboarding({
      ...BASE,
      ownerAtivo: false,
      dominioCustomCadastrado: true,
      dominioCustomAtivo: false,
      emailDomainCadastrado: true,
      emailDomainVerificado: false,
    });
    expect(resultado.publicationStatus).toBe("PENDENTE_OWNER");
  });
});

describe("calcularOnboarding — itens individuais", () => {
  test("subdomínio easymob é sempre CONCLUIDO no modelo de acesso atual", () => {
    const resultado = calcularOnboarding(BASE);
    expect(item(resultado, "subdominio_easymob").status).toBe("CONCLUIDO");
  });

  test("dns_configurado e dominio_verificado ficam PENDENTE sem nenhum domínio custom cadastrado", () => {
    const resultado = calcularOnboarding(BASE);
    expect(item(resultado, "dns_configurado").status).toBe("PENDENTE");
    expect(item(resultado, "dominio_verificado").status).toBe("PENDENTE");
  });

  test("domínio cadastrado mas ainda não verificado fica EM_ANDAMENTO (não PENDENTE)", () => {
    const resultado = calcularOnboarding({ ...BASE, dominioCustomCadastrado: true });
    expect(item(resultado, "dominio_cadastrado").status).toBe("CONCLUIDO");
    expect(item(resultado, "dns_configurado").status).toBe("EM_ANDAMENTO");
    expect(item(resultado, "dominio_verificado").status).toBe("EM_ANDAMENTO");
    expect(item(resultado, "https_ativo").status).toBe("EM_ANDAMENTO");
  });

  test("domínio verificado mas ainda não ACTIVE: dominio_verificado CONCLUIDO, https_ativo EM_ANDAMENTO", () => {
    const resultado = calcularOnboarding({
      ...BASE,
      dominioCustomCadastrado: true,
      dominioCustomVerificado: true,
      dominioCustomAtivo: false,
    });
    expect(item(resultado, "dominio_verificado").status).toBe("CONCLUIDO");
    expect(item(resultado, "https_ativo").status).toBe("EM_ANDAMENTO");
  });

  test("branding_configurado reflete só a presença de uma linha OrganizationBranding", () => {
    expect(item(calcularOnboarding(BASE), "branding_configurado").status).toBe("PENDENTE");
    expect(item(calcularOnboarding({ ...BASE, brandingConfigurado: true }), "branding_configurado").status).toBe(
      "CONCLUIDO"
    );
  });
});
