/**
 * English dictionary: all namespaces merged into one table. Splitting by file is only for maintainability (each file under 500 lines);
 * keys are globally unique at runtime -- the same Chinese sentence should translate the same everywhere, so a duplicate means one is redundant.
 */
import { common } from "./common";
import { editor } from "./editor";
import { workspace } from "./workspace";
import { api } from "./api";
import { components } from "./components";
import { lib } from "./lib";
import { review } from "./review";

const namespaces: Record<string, Record<string, string>> = { common, workspace, editor, api, components, lib, review };

function merge(): Record<string, string> {
  const out: Record<string, string> = {};
  const from: Record<string, string> = {};
  for (const [ns, dict] of Object.entries(namespaces)) {
    for (const [k, v] of Object.entries(dict)) {
      if (Object.hasOwn(out, k) && process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] duplicate en key ${JSON.stringify(k)} in ${from[k]} and ${ns}`);
      }
      out[k] = v;
      from[k] = ns;
    }
  }
  return out;
}

export const en: Record<string, string> = merge();
