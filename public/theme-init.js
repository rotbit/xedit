// 首帧前的两件事，都得在 React 之前跑完，否则会闪
try {
  // 1) 夜间模式偏好，避免闪白
  if (localStorage.getItem("xedit-dark") === "1") {
    document.documentElement.dataset.theme = "dark";
  }
  // 2) 本机是否已有工作区（本地文章 / 曾登录过）。首页对未登录会话一律直出落地页，
  //    好让搜索引擎读到完整内容；老用户这一帧不该看见落地页，先用 CSS 盖住，
  //    等 React 判定完再由工作台接管。判断放这里是为了赶在首次绘制之前。
  var docs = localStorage.getItem("xedit-local-docs");
  var authed = localStorage.getItem("xedit-was-authed") === "1";
  if (authed || (docs && docs !== "[]")) {
    document.documentElement.dataset.ws = "1";
  }
} catch {
  // localStorage 被隐私模式/策略禁用时静默跳过，首帧退回默认外观
}
