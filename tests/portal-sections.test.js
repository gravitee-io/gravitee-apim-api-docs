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

  it("puts next-gen and shared operations in Next Gen sections", () => {
    const grouped = groupOperationsByPortal(aSpec());
    expect(grouped.paths["/apis/_search"].post.tags).toEqual(["Next Gen · Api"]);
    expect(grouped.paths["/applications"].get.tags).toEqual(["Next Gen · Application"]);
  });

  it("puts classic operations in Legacy sections", () => {
    const grouped = groupOperationsByPortal(aSpec());
    expect(grouped.paths["/apis"].get.tags).toEqual(["Legacy (Classic) · Api"]);
    expect(grouped.paths["/applications"].post.tags).toEqual(["Legacy (Classic) · Application"]);
  });

  it("lists the Next Gen sections before the Legacy ones, keeping tag order and descriptions", () => {
    const grouped = groupOperationsByPortal(aSpec());
    expect(grouped.tags).toEqual([
      { name: "Next Gen · Api", description: "All about APIs" },
      { name: "Next Gen · Application", description: "All about applications" },
      { name: "Legacy (Classic) · Api", description: "All about APIs" },
      { name: "Legacy (Classic) · Application", description: "All about applications" },
    ]);
  });

  it("tells custom portal builders to use the Next Gen operations", () => {
    const grouped = groupOperationsByPortal(aSpec());
    expect(grouped.info.description).toMatch(/^> .*Next Gen/);
    expect(grouped.info.description).toContain("API dedicated to the devportal.");
  });

  it("does not modify the spec it is given", () => {
    const spec = aSpec();
    const before = structuredClone(spec);
    groupOperationsByPortal(spec);
    expect(spec).toEqual(before);
  });
});
