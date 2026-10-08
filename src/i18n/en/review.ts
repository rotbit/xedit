/**
 * AI 审核（src/features/review）与产品内分享弹窗（ShareDialog）。
 * 审核类型名与说明来自 lib/ai/reviewKinds.ts 的 tk() 原文。
 */
export const review: Record<string, string> = {
  // 审核类型（reviewKinds.ts）
  表述审核: "Writing Review",
  "逐句看表达：啰嗦、说不清、用词不当，给得出改法的可一键采纳":
    "Checks each sentence for wordiness, unclear phrasing and poor word choice. Fixes can be applied in one click",
  公众号合规审核: "WeChat Compliance Review",
  "对照公众号平台规则：标题党、诱导分享关注、夸大与绝对化用语、敏感内容风险":
    "Checks against WeChat platform rules: clickbait, share or follow baiting, exaggerated or absolute claims, sensitive content",

  // 启动面板与设置
  "AI 审核还没配置好：到管理后台的「AI 设置」里选模型、填 Key":
    "AI review isn't set up yet. Pick a model and add a key under “AI Settings” in the admin console",
  "审核类型（可多选，一起审）": "Review types (pick one or more)",
  至少要审一类: "Pick at least one type",
  开始审核: "Start Review",
  审核设置: "Review Settings",
  按此设置重新审核: "Re-run with These Settings",

  // 审核条
  "正在翻出这条审核记录…": "Loading this review…",
  "AI 正在通读全文，做{kind}…": "AI is reading the full article for {kind}…",
  "{n} 秒": "{n}s",
  一般要半分钟到一分钟: "usually 30–60 seconds",
  审核没能完成: "Review couldn't finish",
  换审核类型: "Change Type",
  "{n} 条建议": "{n} {n, suggestion, suggestions}",
  "已处理 {n}": "{n} resolved",
  "{time} 的记录": "from {time}",
  总评: "Summary",
  审核类型: "Review type",
  "上一条（⌥↑）": "Previous (⌥↑)",
  "下一条（⌥↓）": "Next (⌥↓)",
  审核历史: "Review History",
  重新审核: "Re-run Review",
  退出审核: "Exit Review",

  // 意见栏与卡片
  展开阅读: "Read More",
  "AI 正在审稿": "AI is reviewing",
  "通读全文、逐句挑问题，一般要半分钟到一分钟。意见出来后会贴着对应的句子摆在这一栏。":
    "Reading the whole article and checking it sentence by sentence usually takes 30–60 seconds. Suggestions will appear in this column next to the sentences they refer to",
  审核失败: "Review failed",
  "审核失败（{status}）": "Review failed ({status})",
  换个审核类型: "Try Another Type",
  "没发现需要改的地方，这篇可以直接发。": "Nothing to fix. This one is ready to publish",
  "这一类的意见都处理完了。": "All suggestions in this category are resolved",
  已采纳: "Applied",
  已知道: "Noted",
  原文已修改: "Text changed",
  建议改为: "SUGGESTED",
  "这句已经不在正文里了，撤销回去它会自己回来": "This sentence is no longer in the article. Undo to bring it back",
  "把原文替换成建议（⌘Z 可撤销）": "Replace the text with the suggestion (⌘Z to undo)",
  采纳: "Apply",
  知道了: "Got It",
  忽略: "Ignore",

  // 历史
  历史记录读不出来: "Couldn't load history",
  "正在读取…": "Loading…",
  "这篇文章还没有审核记录。每审完一趟会自动存在这里。":
    "No reviews for this article yet. Each review is saved here automatically",
  "历史记录（点开回看，不重新审）": "History (open to view, no re-run)",
  "模型：{model}": "Model: {model}",
  "{n} 条": "{n} {n, item, items}",
  正在看: "viewing",
  删掉这条记录: "Delete this record",
  "今天 {time}": "Today {time}",
  这条审核记录读不出来: "Couldn't load this review",
  "请求失败（{status}）": "Request failed ({status})",
  "服务返回的结果看不懂，请再试一次": "Got an unexpected response. Please try again",

  // 分享弹窗（ShareDialog）
  加载分享状态失败: "Couldn't load sharing status",
  "分享已开启，链接永久有效": "Sharing is on. The link never expires",
  分享文章: "Share Article",
  "生成一个公开链接，任何人打开都能看到这篇文章的{effect}，并可以像飞书一样对文字、图片、视频批注——无需注册登录。":
    "Create a public link so anyone can see {effect} of this article and comment on text, images and videos, Feishu-style. No sign-up needed",
  公众号真实渲染效果: "exactly how it renders on WeChat",
  "链接永久有效，不会自动过期，随时可以手动关闭": "The link never expires. You can turn it off any time",
  "分享页按你当前的排版主题渲染，正文实时跟随文章更新":
    "The shared page uses your current theme and updates live with the article",
  "关闭后重新开启会生成新链接，旧链接立刻失效；已有批注保留":
    "Turning sharing off and on again creates a new link and disables the old one. Existing comments are kept",
  允许访客批注: "Allow Visitor Comments",
  关闭则正文更宽: "Off gives the text more width",
  "开启分享（永久有效）": "Turn On Sharing (Never Expires)",
  链接永久有效: "Link never expires",
  "{n} 条批注": "{n} {n, comment, comments}",
  关闭分享: "Turn Off Sharing",
  打开分享页: "Open Shared Page",
};
