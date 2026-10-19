// TeX → SVG (MathJax). SVG pasted into the WeChat Official Account editor keeps its styling and needs no fonts;
// this is also mdnice's approach. KaTeX's HTML output gets misaligned in WeChat.
//
// MathJax is large and its init touches Node-only paths, so it's loaded on demand and initialized only in the browser:
// callers (preview/copy) await ensureMathJax() first, while texToSvg stays synchronous for markdown-it.

let convert: ((tex: string, display: boolean) => string) | null = null;
let loading: Promise<void> | null = null;

const cache = new Map<string, string>();

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function ensureMathJax(): Promise<void> {
  if (convert) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    // mathjax's components/version.js dynamically requires package.json when the global PACKAGE_VERSION
    // is undefined (crashing in the browser); define the version up front to bypass that path
    const g = globalThis as Record<string, unknown>;
    if (typeof g.PACKAGE_VERSION === "undefined") g.PACKAGE_VERSION = "3.2.1";

    // Note: AllPackages can't be used; its \require extension depends on Node's require and crashes in the browser
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] =
      await Promise.all([
        import("mathjax-full/js/mathjax.js"),
        import("mathjax-full/js/input/tex.js"),
        import("mathjax-full/js/output/svg.js"),
        import("mathjax-full/js/adaptors/liteAdaptor.js"),
        import("mathjax-full/js/handlers/html.js"),
        // Common TeX extensions; importing registers them
        import("mathjax-full/js/input/tex/ams/AmsConfiguration.js"),
        import("mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js"),
        import("mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js"),
        import("mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js"),
        import("mathjax-full/js/input/tex/color/ColorConfiguration.js"),
        import("mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js"),
      ]);

    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const texInput = new TeX({
      packages: ["base", "ams", "newcommand", "noundefined", "boldsymbol", "color", "mhchem"],
    });
    // fontCache "none": all paths inlined, no <defs>/<use>, safe for pasting and sanitizing
    const svgOutput = new SVG({ fontCache: "none" });
    const mjDocument = mathjax.document("", { InputJax: texInput, OutputJax: svgOutput });

    convert = (tex: string, display: boolean) => {
      const node = mjDocument.convert(tex, { display });
      // convert returns an mjx-container; take its <svg> and move the baseline-alignment styles from the container to the svg
      let svg = adaptor.innerHTML(node);
      const containerStyle = adaptor.getAttribute(node, "style");
      if (containerStyle) {
        svg = svg.replace(/^<svg /, `<svg style="${containerStyle}" `);
      }
      return svg;
    };
  })();
  return loading;
}

/** Render TeX to an <svg> string; falls back to the raw source while MathJax is still loading */
export function texToSvg(tex: string, display: boolean): string {
  if (!convert) {
    return `<code>${escapeHtml(tex)}</code>`;
  }
  const key = `${display ? "D" : "I"}:${tex}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const svg = convert(tex, display);
  if (cache.size > 500) cache.clear();
  cache.set(key, svg);
  return svg;
}
