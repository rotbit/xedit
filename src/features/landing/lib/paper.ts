/**
 * Class conventions for theme samples. Deliberately doesn't import theme CSS,
 * so client components only get a few dozen bytes of class-name rules while the 17KB theme table stays on the server.
 */

export const PAPER_CLASS = "xe-paper";

/** Sample class for a given theme */
export function themeClass(id: string): string {
  return `${PAPER_CLASS} xe-t-${id}`;
}

/** Theme metadata (no CSS), safe to pass to client components */
export interface ThemeMeta {
  id: string;
  name: string;
  color: string;
  tag: string;
}
