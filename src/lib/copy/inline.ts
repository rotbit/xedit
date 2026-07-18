// 将 CSS 规则内联到元素 style 属性上。
// 微信公众号编辑器会丢弃 <style> 与 class，只保留内联样式，
// 因此复制前必须把主题样式全部内联。
// 用浏览器自身的 CSSOM 解析 CSS、querySelectorAll 匹配选择器，
// 按 (important, 特异性, 出现顺序) 实现层叠，行为与真实渲染一致。

interface ParsedRule {
  selector: string;
  decls: { prop: string; value: string; important: boolean }[];
}

/** 借浏览器解析 CSS 文本为规则列表（忽略 @media/@font-face 等） */
function parseCss(cssText: string): ParsedRule[] {
  const style = document.createElement("style");
  style.media = "not all"; // 不影响页面渲染
  style.textContent = cssText;
  document.head.appendChild(style);

  const rules: ParsedRule[] = [];
  const collect = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSStyleRule) {
        const decls: ParsedRule["decls"] = [];
        const s = rule.style;
        for (let i = 0; i < s.length; i++) {
          const prop = s.item(i);
          decls.push({
            prop,
            value: s.getPropertyValue(prop),
            important: s.getPropertyPriority(prop) === "important",
          });
        }
        if (decls.length) rules.push({ selector: rule.selectorText, decls });
      }
    }
  };
  if (style.sheet) collect(style.sheet.cssRules);
  document.head.removeChild(style);
  return rules;
}

/** 简化版选择器特异性：(id, class/attr/伪类, 元素) → 一个可比较的数值 */
function specificity(selector: string): number {
  let s = selector;
  let a = 0;
  let b = 0;
  let c = 0;
  s = s.replace(/\[[^\]]*\]/g, () => {
    b += 1;
    return " ";
  });
  s = s.replace(/#[\w-]+/g, () => {
    a += 1;
    return " ";
  });
  s = s.replace(/\.[\w-]+/g, () => {
    b += 1;
    return " ";
  });
  s = s.replace(/::?[\w-]+(\([^)]*\))?/g, () => {
    b += 1;
    return " ";
  });
  c += (s.match(/[a-zA-Z][\w-]*/g) ?? []).length;
  return a * 10000 + b * 100 + c;
}

function splitSelectors(selectorText: string): string[] {
  // 主题 CSS 由我们自己维护，不使用含逗号的函数式选择器，直接按逗号拆分
  return selectorText.split(",").map((s) => s.trim()).filter(Boolean);
}

interface PendingDecl {
  prop: string;
  value: string;
  important: boolean;
  spec: number;
  order: number;
}

/**
 * 把 cssTexts（按优先级从低到高排列）内联到 root 及其后代的 style 属性。
 * 元素原有的内联样式（如 MathJax SVG 自带的）优先级最高，保持不变。
 */
export function inlineStyles(root: HTMLElement, cssTexts: string[]): void {
  const rules = cssTexts.flatMap(parseCss);
  const pending = new Map<HTMLElement, PendingDecl[]>();

  rules.forEach((rule, order) => {
    for (const sel of splitSelectors(rule.selector)) {
      const spec = specificity(sel);
      let matched: HTMLElement[] = [];
      try {
        matched = Array.from(root.querySelectorAll<HTMLElement>(sel));
        if (root.matches(sel)) matched.push(root);
      } catch {
        continue; // 无法解析的选择器直接跳过
      }
      for (const el of matched) {
        let list = pending.get(el);
        if (!list) {
          list = [];
          pending.set(el, list);
        }
        for (const d of rule.decls) {
          list.push({ ...d, spec, order });
        }
      }
    }
  });

  for (const [el, decls] of pending) {
    const original = el.getAttribute("style");
    decls.sort((x, y) => {
      if (x.important !== y.important) return x.important ? 1 : -1;
      if (x.spec !== y.spec) return x.spec - y.spec;
      return x.order - y.order;
    });
    // 从低优先级到高依次写入，后写覆盖先写，等价于层叠结果
    for (const d of decls) {
      el.style.setProperty(d.prop, d.value);
    }
    // 元素原有内联样式最后写入，保证其优先级最高
    if (original) {
      el.setAttribute("style", `${el.getAttribute("style") ?? ""};${original}`);
    }
  }
}
