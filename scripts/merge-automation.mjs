// Merge the Automation OpenAPI fragments of Gamma modules into the core
// Automation spec, as a running APIM serves it at /automation/open-api.yaml.
//
// Usage: node scripts/merge-automation.mjs <base.yaml> <module>=<fragment.yaml>...
//   The merged document is written to stdout.
//
// The rules mirror APIM's OpenApiFragmentMerger (gravitee-apim-rest-api-automation-rest,
// io.gravitee.apim.rest.api.automation.openapi): the published spec must match what an
// instance serves, so change them only together with that class.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse, stringify } from "yaml";

export function mergeFragments(baseDocument, fragmentsByModule) {
  const document = structuredClone(asMapping(baseDocument));
  for (const [module, fragment] of Object.entries(fragmentsByModule)) {
    mergeFragment(document, module, structuredClone(asMapping(fragment)));
  }
  return document;
}

function mergeFragment(document, module, fragment) {
  mergeMap(document, fragment, "paths", module, "path");
  if (isMapping(fragment.components)) {
    document.components ??= {};
    for (const section of Object.keys(fragment.components)) {
      mergeMap(document.components, fragment.components, section, module, "component");
    }
  }
  if (Array.isArray(fragment.tags)) {
    document.tags ??= [];
    for (const tag of fragment.tags) {
      if (!document.tags.some((existing) => existing?.name === tag?.name)) {
        document.tags.push(tag);
      }
    }
  }
}

function mergeMap(target, source, field, module, what) {
  const entries = source[field];
  if (!isMapping(entries)) {
    return;
  }
  target[field] ??= {};
  for (const [key, value] of Object.entries(entries)) {
    if (Object.hasOwn(target[field], key)) {
      throw new Error(`Automation OpenAPI fragment of module [${module}] redefines ${what} [${key}]`);
    }
    target[field][key] = value;
  }
}

function isMapping(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asMapping(value) {
  if (!isMapping(value)) {
    throw new Error("An OpenAPI document must be a YAML mapping");
  }
  return value;
}

function main(args) {
  if (args.length < 1) {
    console.error("Usage: merge-automation.mjs <base.yaml> <module>=<fragment.yaml>...");
    process.exit(2);
  }
  const [basePath, ...fragmentArgs] = args;
  const fragments = {};
  for (const arg of fragmentArgs) {
    const separator = arg.indexOf("=");
    if (separator <= 0) {
      throw new Error(`Expected <module>=<fragment.yaml>, got [${arg}]`);
    }
    fragments[arg.slice(0, separator)] = parse(readFileSync(arg.slice(separator + 1), "utf8"));
  }
  const merged = mergeFragments(parse(readFileSync(basePath, "utf8")), fragments);
  process.stdout.write(stringify(merged, { lineWidth: 0 }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
