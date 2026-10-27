import { describe, it, expect } from "vitest";
import { groupOperationsByPortal } from "../assets/lib.js";

const aSpec = () => ({
  openapi: "3.0.0",
  info: { title: "Portal", description: "API dedicated to the devportal." },
  tags: [
    { name: "Api", description: "All about APIs" },
    { name: "Application", description: "All about applications" },
    { name: "Unused", description: "No operation uses it" },
  ],
  paths: {
    "/apis": {
      get: { tags: ["Api"], operationId: "getApis", "x-gravitee-portal": "classic" },
    },
    "/apis/_search": {
      post: { tags: ["Api"], operationId: "searchApis", "x-gravitee-portal": "both" },
    },
    "/applications": {
      parameters: [{ $ref: "#/components/parameters/pageParam" }],
      get: { tags: ["Application"], operationId: "getApplications", "x-gravitee-portal": "next" },
      post: { tags: ["Application"], operationId: "createApplication", "x-gravitee-portal": "classic" },
    },
  },
});

describe("groupOperationsByPortal", () => {
  it("returns a spec without the extension untouched", () => {
    const spec = aSpec();
    for (const item of Object.values(spec.paths)) {
      for (const op of Object.values(item)) delete op["x-gravitee-portal"];
    }
    expect(groupOperationsByPortal(spec)).toBe(spec);
  });

  it("keeps the tags of next-gen and shared operations", () => {
    const grouped = groupOperationsByPortal(aSpec());
    expect(grouped.paths["/apis/_search"].post.tags).toEqual(["Api"]);
    expect(grouped.paths["/applications"].get.tags).toEqual(["Application"]);
  });

  it("puts classic operations in Legacy sections", () => {
    const grouped = groupOperationsByPortal(aSpec());
    expect(grouped.paths["/apis"].get.tags).toEqual(["Legacy · Api"]);
    expect(grouped.paths["/applications"].post.tags).toEqual(["Legacy · Application"]);
  });

  it("lists the Legacy sections after the other ones, keeping tag order and descriptions", () => {
    const grouped = groupOperationsByPortal(aSpec());
    expect(grouped.tags).toEqual([
      { name: "Api", description: "All about APIs" },
      { name: "Application", description: "All about applications" },
      { name: "Legacy · Api", description: "All about APIs" },
      { name: "Legacy · Application", description: "All about applications" },
    ]);
  });

  it("tells custom portal builders to avoid the Legacy operations", () => {
    const grouped = groupOperationsByPortal(aSpec());
    expect(grouped.info.description).toMatch(/^> .*Legacy/);
    expect(grouped.info.description).toContain("API dedicated to the devportal.");
  });

  it("does not modify the spec it is given", () => {
    const spec = aSpec();
    const before = structuredClone(spec);
    groupOperationsByPortal(spec);
    expect(spec).toEqual(before);
  });
});
