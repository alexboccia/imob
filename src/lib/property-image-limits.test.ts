import { describe, test, expect, afterEach } from "vitest";
import { compressaoDeImovelHabilitada } from "@/lib/property-image-limits";

describe("compressaoDeImovelHabilitada", () => {
  afterEach(() => {
    delete process.env.PROPERTY_IMAGE_COMPRESSION_ENABLED;
  });

  test("desligada por padrão (variável ausente) — gate de publicação pendente de validação visual", () => {
    expect(compressaoDeImovelHabilitada()).toBe(false);
  });

  test("desligada para qualquer valor que não seja exatamente a string 'true'", () => {
    process.env.PROPERTY_IMAGE_COMPRESSION_ENABLED = "1";
    expect(compressaoDeImovelHabilitada()).toBe(false);
    process.env.PROPERTY_IMAGE_COMPRESSION_ENABLED = "yes";
    expect(compressaoDeImovelHabilitada()).toBe(false);
  });

  test("ligada só com o valor exato 'true'", () => {
    process.env.PROPERTY_IMAGE_COMPRESSION_ENABLED = "true";
    expect(compressaoDeImovelHabilitada()).toBe(true);
  });
});
