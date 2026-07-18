// TeX → SVG（MathJax）。SVG 粘贴进微信公众号编辑器不会丢样式、不依赖字体，
// 这也是 mdnice 的公式方案；KaTeX 的 HTML 输出在微信里会错位。
//
// MathJax 体积大且初始化会触碰 Node 专属路径，因此按需动态加载、只在浏览器端初始化：
// 调用方（预览/复制）先 await ensureMathJax()，texToSvg 本身保持同步供 markdown-it 使用。

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
    // mathjax 的 components/version.js 在全局 PACKAGE_VERSION 未定义时会动态 require
    // 读取 package.json（浏览器端直接崩溃），提前定义版本号绕过该路径
    const g = globalThis as Record<string, unknown>;
    if (typeof g.PACKAGE_VERSION === "undefined") g.PACKAGE_VERSION = "3.2.1";

    // 注意：不能用 AllPackages —— 其中的 \require 扩展依赖 Node 的 require，浏览器会崩
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] =
      await Promise.all([
        import("mathjax-full/js/mathjax.js"),
        import("mathjax-full/js/input/tex.js"),
        import("mathjax-full/js/output/svg.js"),
        import("mathjax-full/js/adaptors/liteAdaptor.js"),
        import("mathjax-full/js/handlers/html.js"),
        // 常用 TeX 扩展，import 即自注册
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
    // fontCache "none"：路径全部内联，不依赖 <defs>/<use>，粘贴与消毒都安全
    const svgOutput = new SVG({ fontCache: "none" });
    const mjDocument = mathjax.document("", { InputJax: texInput, OutputJax: svgOutput });

    convert = (tex: string, display: boolean) => {
      const node = mjDocument.convert(tex, { display });
      // convert 返回 mjx-container，取其中的 <svg>；基线对齐样式在容器上，转移到 svg
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

/** 渲染 TeX 为 <svg> 字符串；MathJax 尚未加载完成时降级为原文 */
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
