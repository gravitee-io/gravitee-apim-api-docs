import { describe, it, expect } from "vitest";
import { filterOperationsByPortal } from "../assets/lib.js";

const aSpec = () => ({
  openapi: "3.0.0",
  info: { title: "Portal" },
  tags: [
    { name: "Api", description: "All about APIs" },
    { name: "Application", description: "All about applications" },
    { name: "Notifiers", description: "Classic only" },
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
    "/notifiers": {
      get: { tags: ["Notifiers"], operationId: "getNotifiers", "x-gravitee-portal": "classic" },
    },
  },
});

const operationIds = (spec) =>
  Object.values(spec.paths).flatMap((item) =>
    Object.values(item).filter((op) => op.operationId).map((op) => op.operationId),
  );

describe("filterOperationsByPortal", () => {
  it("keeps the next-gen and shared operations for the Next Gen Portal", () => {
    expect(operationIds(filterOperationsByPortal(aSpec(), "next"))).toEqual([
      "searchApis",
      "getApplications",
    ]);
  });

  it("keeps the classic and shared operations for the Classic Portal", () => {
    expect(operationIds(filterOperationsByPortal(aSpec(), "classic"))).toEqual([
      "getApis",
      "searchApis",
      "createApplication",
      "getNotifiers",
    ]);
  });

  it("drops the paths left without operations and keeps the parameters of the others", () => {
    const filtered = filterOperationsByPortal(aSpec(), "next");
    expect(Object.keys(filtered.paths)).toEqual(["/apis/_search", "/applications"]);
    expect(filtered.paths["/applications"].parameters).toHaveLength(1);
  });

  it("drops the tags left without operations", () => {
    const filtered = filterOperationsByPortal(aSpec(), "next");
    expect(filtered.tags.map((tag) => tag.name)).toEqual(["Api", "Application"]);
  });

  it("does not modify the spec it is given", () => {
    const spec = aSpec();
    const before = structuredClone(spec);
    filterOperationsByPortal(spec, "next");
    expect(spec).toEqual(before);
  });
});
