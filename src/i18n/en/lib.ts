/**
 * src/lib 下的文案：编辑器实时预览部件、主题名、本地文件夹、飞书、封面生成、上传与服务端固定报错。
 * 带变量拼出来的服务端报错客户端对不上 key，留在源码里标了 i18n-ignore，这里不收。
 */
export const lib: Record<string, string> = {
  // 实时预览部件
  "⌘ + 点击打开": "⌘ + Click to open",
  "Ctrl + 点击打开": "Ctrl + Click to open",
  "发送到公众号时自动设置；在标题下方的「封面」里更换":
    "Set automatically when sent to WeChat. Change it under “Cover” below the title",
  点击编辑图片地址: "Click to edit image URL",
  "{alt}（图片未加载）": "{alt} (image failed to load)",
  图片未加载: "Image failed to load",
  "▶ 视频": "▶ Video",
  点击编辑视频源码: "Click to edit video source",
  删除代码块: "Delete Code Block",
  纯文本: "Plain Text",
  代码语言: "Code language",
  点击编辑公式: "Click to edit formula",

  // 斜杠菜单
  提示块: "Callout",
  无序列表: "Bulleted List",
  有序列表: "Numbered List",

  // 相对时间
  刚刚: "Just now",
  "{n} 分钟前": "{n} {n, minute, minutes} ago",
  "{n} 小时前": "{n} {n, hour, hours} ago",

  // 导出 / 复制 / 上传
  "已导出，但 {n} 个图片未能嵌入（获取失败）":
    "Exported, but {n} {n, image, images} couldn’t be embedded (fetch failed)",
  "Word 文档已导出": "Word document exported",
  "Word 生成失败": "Couldn’t generate Word document",
  当前浏览器不支持复制: "This browser doesn’t support copying",
  文件登记失败: "Couldn’t register the file",
  "视频直传失败：请检查 OSS Bucket 的跨域（CORS）配置是否放行本站 PUT":
    "Direct video upload failed: check that the OSS bucket’s CORS settings allow PUT from this site",
  "视频上传需要 OSS 直传，服务端未配置阿里云 OSS":
    "Video upload needs direct OSS upload, but Alibaba Cloud OSS isn’t configured on the server",
  "视频不能超过 100MB": "Videos can’t exceed 100MB",
  "登录已过期，请重新登录": "Your session has expired. Please sign in again",

  // 云同步冲突
  "云端有另一份改动，已存为历史版本，本地内容已覆盖上去":
    "The cloud had other changes. They were saved as a version and replaced with your local content",
  "云端有另一份改动，历史版本没存下来，本地内容已覆盖上去":
    "The cloud had other changes. They couldn’t be saved as a version and were replaced with your local content",

  // 资源与权限
  空文件: "Empty file",
  "服务端未配置阿里云 OSS，无法上传": "Alibaba Cloud OSS isn’t configured on the server, so uploads are unavailable",
  "非法的图片 URL": "Invalid image URL",
  "仅支持 http/https 图片地址": "Only http/https image URLs are supported",
  "禁止访问内网 / 保留地址": "Private or reserved addresses aren’t allowed",
  "重定向缺少 Location": "Redirect is missing a Location header",
  重定向次数过多: "Too many redirects",
  "抓取失败: 响应没有内容": "Fetch failed: empty response",
  "账号已被限制为只读，仅可查看与导出": "Your account is read-only. You can only view and export",
  "在编辑器里用 AI 检查表述与公众号合规": "Use AI in the editor to check wording and WeChat compliance",
  "AI 生成封面": "AI Cover",
  "用 AI 生成公众号封面图，按张计费": "Generate WeChat cover images with AI, billed per image",

  // 本地文件夹
  "找不到目录 {path}": "Folder not found: {path}",
  "建不出目录 {path}": "Couldn’t create folder {path}",
  不能把文件夹搬进它自己里: "Can’t move a folder into itself",
  "写入文件夹失败：{msg}": "Couldn’t write to the folder: {msg}",
  "打开文件夹失败：{msg}": "Couldn’t open the folder: {msg}",
  没拿到文件夹的读写权限: "No read/write permission for the folder",
  "选择文件夹失败：{msg}": "Couldn’t select the folder: {msg}",
  "当前环境没有 IndexedDB": "IndexedDB isn’t available in this environment",
  "打开 IndexedDB 失败": "Couldn’t open IndexedDB",
  "IndexedDB 读写失败": "IndexedDB read/write failed",

  // 飞书
  "请先在「飞书知识库导入」里连接飞书": "Connect Feishu in “Feishu Wiki Import” first",
  "飞书侧找不到原文档（可能已被删除或移出知识库）":
    "The original document wasn’t found in Feishu (it may have been deleted or moved out of the wiki)",
  "还没选过目标知识库：请先在「飞书知识库导入」里选择知识库（同步一次即可记住）":
    "No target wiki selected yet. Choose one in “Feishu Wiki Import” first (syncing once remembers it)",
  读取飞书文档结构失败: "Couldn’t read the Feishu document structure",
  "飞书授权已失效，请重新连接": "Feishu authorization has expired. Please reconnect",
  请先在对话框里保存你的飞书应用凭证: "Save your Feishu app credentials in the dialog first",
  飞书侧找不到该节点: "This node wasn’t found in Feishu",
  创建知识库节点失败: "Couldn’t create the wiki node",
  "（知识库过大）": "(Wiki too large)",
  "节点数超过上限，仅同步前 1000 个": "Too many nodes. Only the first 1,000 were synced",
  未知错误: "Unknown error",

  // AI 服务与封面生成
  已取消: "Canceled",
  "Replicate 返回了异常的接口地址，已中止": "Replicate returned an unexpected API URL. Aborted",
  "DeepSeek（官网）": "DeepSeek (Official)",
  "Claude（Replicate）": "Claude (Replicate)",
  "GPT（Replicate）": "GPT (Replicate)",
  "GPT（OpenAI 官网）": "GPT (OpenAI Official)",
  "Kimi（月之暗面官网）": "Kimi (Moonshot Official)",
  "GLM（智谱官网）": "GLM (Zhipu Official)",
  "这串 token 太长了，检查一下是不是粘错了": "This token is too long. Check that you pasted the right thing",
  "标题是空的，先给文章起个标题": "The title is empty. Give the article a title first",
  "Replicate 拒绝了站点的 Token，请检查服务端配置": "Replicate rejected the site token. Check the server configuration",
  "站点的 Replicate 账户余额不足": "The site’s Replicate account has insufficient balance",
  "生图服务正忙，稍后再试": "The image service is busy. Try again later",
  生成被取消了: "Generation was canceled",
  "提示词被内容安全策略拦下了，换个说法试试": "The prompt was blocked by the content safety policy. Try rephrasing",
  生成完了却没拿到图片: "Generation finished but no image was returned",
  图片地址不合法: "Invalid image URL",
  "图片地址不是 https，已中止": "Image URL isn’t https. Aborted",
  下载到的不是图片: "The downloaded file isn’t an image",
  "生成的图片太大（超过 8MB）": "The generated image is too large (over 8MB)",
  "连不上生图服务，请稍后再试": "Can’t reach the image service. Try again later",

  // 排版主题：名字 + 适用场景标签
  经典黑: "Classic Black",
  "技术 · 深度长文": "Tech · Long Reads",
  微信绿: "WeChat Green",
  "职场 · 生活": "Work · Life",
  科技蓝: "Tech Blue",
  技术教程: "Tech Tutorials",
  蓝莹: "Azure",
  "技术 · 科普": "Tech · Explainers",
  橙心: "Tangerine",
  "情感 · 生活": "Feelings · Life",
  蔷薇紫: "Rose Violet",
  "时尚 · 女性": "Fashion · Women",
  水墨: "Ink Wash",
  "文化 · 散文": "Culture · Essays",
  绛红: "Crimson",
  "品牌 · 活动": "Brand · Events",
  青竹: "Bamboo",
  "国风 · 读书": "Chinese Style · Books",
  杂志风: "Magazine",
  "深度 · 评论": "In-Depth · Commentary",
  靛夜: "Indigo Night",
  "程序员 · 夜读": "Developers · Night Reading",
  樱粉: "Sakura",
  "女性 · 生活": "Women · Life",
  极简: "Minimal",
  万字长文: "Very Long Reads",
  "Atom One 亮": "Atom One Light",
  "Atom One 暗": "Atom One Dark",

  // 自定义主题的样式选项
  短下划线: "Short Underline",
  左竖线: "Left Bar",
  色块章节: "Color Block",
  两侧翼线: "Side Wings",
  纯色简约: "Solid Simple",
  左线浅底: "Left Bar + Tint",
  描边卡片: "Outlined Card",
  极简灰线: "Minimal Gray Line",
  实线下划: "Solid Underline",
  虚线下划: "Dashed Underline",
  仅颜色: "Color Only",
  未命名主题: "Untitled Theme",
};
