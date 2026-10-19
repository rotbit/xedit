/**
 * Strings with embedded JSX nodes (bold article names, numbers, etc.): the whole sentence goes through t(),
 * node positions use `{name}` placeholders, and the nodes are inserted back here.
 * Don't translate it as 「写了」 + node fragments: English word order often differs (「《X》存档」 → "Saved a version of X"),
 * and split fragments can't be translated correctly.
 */
import { Fragment, type ReactNode } from "react";

export function rich(text: string, slots: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    const node = name !== undefined && name in slots ? slots[name] : part;
    return <Fragment key={i}>{node}</Fragment>;
  });
}
