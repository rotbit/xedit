/**
 * 文案里夹 JSX 节点（加粗的文章名、数字等）：整句交给 t() 翻译，
 * 节点位置用 `{name}` 占位，这里再按占位把节点插回去。
 * 不拆成「写了」+ 节点 两段翻：英文语序常常不同（「《X》存档」→ "Saved a version of X"），
 * 拆开的碎片翻不对。
 */
import { Fragment, type ReactNode } from "react";

export function rich(text: string, slots: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    const node = name !== undefined && name in slots ? slots[name] : part;
    return <Fragment key={i}>{node}</Fragment>;
  });
}
