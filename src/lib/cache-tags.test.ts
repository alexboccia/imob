import { describe, test, expect } from "vitest";
import { tagConfiguracao, tagFacetas } from "@/lib/cache-tags";

describe("cache-tags — isolamento entre organizações", () => {
  test("tagConfiguracao é diferente para organizações diferentes", () => {
    expect(tagConfiguracao("org-a")).not.toBe(tagConfiguracao("org-b"));
  });

  test("tagFacetas é diferente para organizações diferentes", () => {
    expect(tagFacetas("org-a")).not.toBe(tagFacetas("org-b"));
  });

  test("a mesma organização sempre produz a mesma tag (determinístico)", () => {
    expect(tagConfiguracao("org-a")).toBe(tagConfiguracao("org-a"));
    expect(tagFacetas("org-a")).toBe(tagFacetas("org-a"));
  });

  test("tags incluem o organizationId literalmente, não um hash opaco", () => {
    expect(tagConfiguracao("org-a").includes("org-a")).toBe(true);
    expect(tagFacetas("org-a").includes("org-a")).toBe(true);
  });

  test("tag de configuração e de facetas nunca colidem entre si pra mesma organização", () => {
    expect(tagConfiguracao("org-a")).not.toBe(tagFacetas("org-a"));
  });
});
