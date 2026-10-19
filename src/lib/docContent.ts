/**
 * Read access for document bodies: the local library `xedit-local-doc:*` and the cloud mirror `xedit-mirror-doc:*` are stored separately,
 * routed by id prefix. Pulled out of docSearch.ts only to untangle dependencies:
 * the derived-data cache (docIndex) and search (docSearch) both read bodies, and search also uses docIndex,
 * so keeping them together created a cycle; reading bodies is the bottom layer anyway.
 */

import { getMirrorContent } from "@/lib/docStore";
import { getLocalDocContent, isLocalId } from "@/lib/localDocs";

/** Unavailable (e.g. mirror not fetched yet) is treated as empty */
export function getDocContent(id: string): string {
  return (isLocalId(id) ? getLocalDocContent(id) : getMirrorContent(id)) ?? "";
}
