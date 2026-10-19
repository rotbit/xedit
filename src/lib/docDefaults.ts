// Two fallback field values for documents. Both server (API routes, Prisma writes) and client (store, sidebar, local library)
// use them for defaults and comparisons, so they live in a lib with no deps on either side, so the server never imports
// features/workspace (its "use client" modules would get dragged into the server graph).

/** Home for uncategorized documents; also a reserved name, so users can't create a category with it */
export const UNCATEGORIZED = "未分类"; // i18n-ignore reserved name stored in data; displayed via t()

/** Placeholder title when none is given. Empty titles always become this, so it also signals "no title" */
export const UNTITLED_DOC = "未命名文章"; // i18n-ignore reserved name stored in data; displayed via t()
