// 首帧前恢复夜间模式与等级皮肤，避免闪变
try {
  if (localStorage.getItem("xedit-dark") === "1") {
    document.documentElement.dataset.theme = "dark";
  }
  var lv = Number(localStorage.getItem("xedit-ui-level"));
  if (lv >= 2 && lv <= 6) {
    document.documentElement.dataset.level = String(lv);
  }
} catch (e) {}
