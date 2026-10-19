// Inlines CSS rules into elements' style attributes.
// The WeChat Official Account editor drops <style> and class and keeps only inline styles,
// so all theme styles must be inlined before copying.
// Uses the browser's own CSSOM to parse CSS and querySelectorAll to match selectors,
// cascading by (important, specificity, source order) so the result matches real rendering.

interface ParsedRule {
  selector: string;
  decls: { prop: string; value: string; important: boolean }[];
}

/** Uses the browser to parse CSS text into a rule list (ignoring @media/@font-face etc.) */
function parseCss(cssText: string): ParsedRule[] {
  const style = document.createElement("style");
  style.media = "not all"; // Doesn't affect page rendering
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

/** Simplified selector specificity: (id, class/attr/pseudo-class, element) → one comparable number */
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
  // We maintain the theme CSS ourselves and don't use functional selectors containing commas, so just split on commas
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
 * Inlines cssTexts (ordered from lowest to highest priority) into the style attributes of root and its descendants.
 * Elements' existing inline styles (e.g. MathJax SVG's own) have the highest priority and are left untouched.
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
        continue; // Skip selectors that can't be parsed
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
    // Write from lowest to highest priority; later writes override earlier ones, equivalent to the cascade result
    for (const d of decls) {
      el.style.setProperty(d.prop, d.value);
    }
    // Write the element's original inline styles last so they keep the highest priority
    if (original) {
      el.setAttribute("style", `${el.getAttribute("style") ?? ""};${original}`);
    }
  }
}
