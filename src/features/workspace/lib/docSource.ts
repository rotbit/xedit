import { listLocalDocs } from "@/lib/localDocs";
import { listMirrorDocs } from "@/lib/docStore";
import type { DocMeta } from "../types";

/** The logged-in doc list = cloud mirror + local docs not yet uploaded, all from local storage (available offline) */
export function mergedCloudList(): DocMeta[] {
  return [...listLocalDocs(), ...listMirrorDocs()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}
