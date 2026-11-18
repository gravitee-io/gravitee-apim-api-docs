import { describe, it, expect } from "vitest";
import { mergeFragments } from "../scripts/merge-automation.mjs";

function base() {
  return {
    openapi: "3.1.0",
    info: { title: "Gravitee.io - Automation API", version: "1.0.0" },
    servers: [{ url: "https://eu.cloudgate.gravitee.io/apim/automation" }],
    security: [{ BearerAuth: [] }],
    tags: [{ name: "APIs", description: "Everything about APIs" }],
    paths: { "/organizations/{orgId}/environments/{envId}/apis": { put: {} } },
    components: {
      schemas: { ApiV4Spec: { type: "object" } },
      parameters: { orgIdParam: { name: "orgId", in: "path" } },
    },
  };
}

function aimFragment() {
  return {
    openapi: "3.1.0",
    info: { title: "Gravitee.io - Automation API - AI Management", version: "1.0.0" },
    servers: [{ url: "https://elsewhere.example" }],
    security: [{ CloudAuth: [] }],
    tags: [{ name: "MCP Proxies", description: "MCP proxies" }],
    paths: { "/organizations/{orgId}/environments/{envId}/aim/mcp-proxies": { put: {} } },
    components: {
      schemas: { AimMcpProxySpec: { type: "object" } },
      parameters: { AimOrgIdParam: { name: "orgId", in: "path" } },
      responses: { AimNotFound: { description: "Not found" } },
    },
  };
}

describe("mergeFragments", () => {
  it("adds the paths and every component section of each fragment", () => {
    const merged = mergeFragments(base(), { aim: aimFragment() });

    expect(Object.keys(merged.paths)).toEqual([
      "/organizations/{orgId}/environments/{envId}/apis",
      "/organizations/{orgId}/environments/{envId}/aim/mcp-proxies",
    ]);
    expect(Object.keys(merged.components.schemas)).toEqual(["ApiV4Spec", "AimMcpProxySpec"]);
    expect(Object.keys(merged.components.parameters)).toEqual(["orgIdParam", "AimOrgIdParam"]);
    expect(merged.components.responses).toEqual({ AimNotFound: { description: "Not found" } });
  });

  it("keeps info, servers and security from the base document", () => {
    const merged = mergeFragments(base(), { aim: aimFragment() });

    expect(merged.info).toEqual(base().info);
    expect(merged.servers).toEqual(base().servers);
    expect(merged.security).toEqual(base().security);
  });

  it("appends a fragment tag only when no tag of that name exists", () => {
    const fragment = aimFragment();
    fragment.tags.push({ name: "APIs", description: "A redefinition that must not win" });

    const merged = mergeFragments(base(), { aim: fragment });

    expect(merged.tags).toEqual([
      { name: "APIs", description: "Everything about APIs" },
      { name: "MCP Proxies", description: "MCP proxies" },
    ]);
  });

  it("merges several fragments in the order given", () => {
    const authz = {
      paths: { "/organizations/{orgId}/environments/{envId}/authz/pdps": { put: {} } },
      tags: [{ name: "Authorization PDPs" }],
    };

    const merged = mergeFragments(base(), { aim: aimFragment(), authz });

    expect(Object.keys(merged.paths)).toHaveLength(3);
    expect(merged.tags.map((t) => t.name)).toEqual(["APIs", "MCP Proxies", "Authorization PDPs"]);
  });

  it("creates the paths, components and tags of a base document that has none", () => {
    const merged = mergeFragments({ openapi: "3.1.0", info: { title: "t" } }, { aim: aimFragment() });

    expect(Object.keys(merged.paths)).toHaveLength(1);
    expect(Object.keys(merged.components)).toEqual(["schemas", "parameters", "responses"]);
    expect(merged.tags).toHaveLength(1);
  });

  it("fails when a fragment redefines a path, naming the module and the path", () => {
    const fragment = aimFragment();
    fragment.paths["/organizations/{orgId}/environments/{envId}/apis"] = { get: {} };

    expect(() => mergeFragments(base(), { aim: fragment })).toThrow(
      "Automation OpenAPI fragment of module [aim] redefines path [/organizations/{orgId}/environments/{envId}/apis]",
    );
  });

  it("fails when a fragment redefines a component, naming the module and the component", () => {
    const fragment = aimFragment();
    fragment.components.schemas.ApiV4Spec = { type: "string" };

    expect(() => mergeFragments(base(), { aim: fragment })).toThrow(
      "Automation OpenAPI fragment of module [aim] redefines component [ApiV4Spec]",
    );
  });

  it("fails when a fragment is not a mapping", () => {
    expect(() => mergeFragments(base(), { aim: ["not", "a", "mapping"] })).toThrow(
      "An OpenAPI document must be a YAML mapping",
    );
  });

  it("returns the base document unchanged when there is no fragment", () => {
    expect(mergeFragments(base(), {})).toEqual(base());
  });

  it("leaves its arguments untouched", () => {
    const document = base();
    const fragment = aimFragment();

    mergeFragments(document, { aim: fragment });

    expect(document).toEqual(base());
    expect(fragment).toEqual(aimFragment());
  });
});
