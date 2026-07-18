// 首帧前恢复夜间模式偏好，避免闪白
try {
  if (localStorage.getItem("xedit-dark") === "1") {
    document.documentElement.dataset.theme = "dark";
  }
} catch (e) {}
