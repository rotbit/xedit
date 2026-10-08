/**
 * 服务端返回给网页的报错 / 提示（src/app/api），以及 OAuth 授权页（src/app/oauth）。
 * 路由里用 tk() 标记、原样返回中文，客户端展示处 t(msg) 时按这张表翻；
 * 带变量的几句在服务端按请求语言直接 translate()，同样以这里为准。
 */
export const api: Record<string, string> = {
  // 通用
  "未登录": "Not signed in",
  "请先登录": "Please sign in first",
  "无权访问": "Access denied",
  "参数缺失": "Missing parameters",
  "不支持的操作": "Unsupported operation",
  "请求格式错误": "Invalid request format",
  "操作失败，稍后再试": "Something went wrong, please try again later",
  "保存失败，稍后再试": "Couldn't save, please try again later",

  // 后台管理
  "认不出这个 key 槽位": "Unrecognized key slot",
  "提示词得是一段文字": "The prompt must be text",
  "认不出这个 AI 供应商": "Unrecognized AI provider",
  "账号不存在": "Account not found",
  "密码": "Password",
  "管理员账号不能封禁": "Admin accounts can't be banned",
  "配额需在 0 到 1TB 之间": "Quota must be between 0 and 1 TB",
  "配额格式不正确": "Invalid quota format",
  "认不出这个权限": "Unrecognized permission",
  "每日次数需在 1 到 10000 之间": "Daily limit must be between 1 and 10,000",
  "没有要修改的字段": "Nothing to update",
  "管理员账号不能删除": "Admin accounts can't be deleted",

  // AI 审核
  "读审核记录失败": "Couldn't load the review record",
  "存审核动作失败": "Couldn't save the review action",
  "删审核记录失败": "Couldn't delete the review record",
  "你的账号还没开通 AI 审核，找管理员开通": "AI review isn't enabled for your account yet. Ask an admin to turn it on",
  "这条审核记录不在了": "This review record no longer exists",
  "缺少文章 id": "Missing article ID",
  "历史记录读不出来，稍后再试": "Couldn't load history, please try again later",
  "认不出这个审核类型": "Unrecognized review type",
  "正文是空的，没什么可审的": "The article is empty, nothing to review",
  "请先登录再用 AI 审核": "Sign in to use AI review",
  "还没有配置 {provider} 的 Key，到管理后台的「AI 设置」里填上":
    "No API key configured for {provider}. Add one under “AI Settings” in the admin console",
  "上一次还在跑，等它出来再点": "The previous request is still running, please wait for it to finish",
  "今天的 AI 次数用完了（每天 {limit} 次），明天再来":
    "You've used up today's AI quota ({limit} per day). Come back tomorrow",
  "审核失败，请稍后再试": "Review failed, please try again later",
  "正文太长了": "The article is too long",

  // AI 生成封面
  "请先登录再使用 AI 生成封面": "Sign in to generate covers with AI",
  "封面信息不完整": "Cover details are incomplete",
  "上一张还在生成，等它出来再点": "The previous cover is still generating, please wait for it to finish",
  "今天的 AI 生成封面次数用完了（每天 {limit} 次），明天再来":
    "You've used up today's AI cover quota ({limit} per day). Come back tomorrow",
  "生成失败，请稍后再试": "Generation failed, please try again later",
  "封面信息太长了": "Cover details are too long",

  // 素材 / 上传
  "尺寸不合法": "Invalid dimensions",
  "图片不存在": "Image not found",
  "素材不存在": "Asset not found",
  "仅管理员可同步 OSS 历史文件": "Only admins can sync existing OSS files",
  "服务端未配置 OSS": "OSS isn't configured on the server",
  "请先登录再使用图床": "Sign in to use image hosting",
  "服务端未配置阿里云 OSS": "Alibaba Cloud OSS isn't configured on the server",
  "服务端未配置阿里云 OSS，请在 .env 中填写 OSS_* 变量":
    "Alibaba Cloud OSS isn't configured on the server. Set the OSS_* variables in .env",
  "不支持的文件类型: {type}": "Unsupported file type: {type}",
  "不支持的图片类型: {type}": "Unsupported image type: {type}",
  "非法的对象名": "Invalid object name",
  "文件未上传成功": "The file wasn't uploaded",
  "缺少文件": "No file provided",
  "视频仅支持浏览器直传，请确认 OSS Bucket 已配置跨域（CORS）":
    "Videos can only be uploaded directly from the browser. Make sure CORS is configured on the OSS bucket",
  "图片不能超过 10MB": "Images can't exceed 10 MB",
  "上传失败，请稍后重试": "Upload failed, please try again later",

  // 导出时代理媒体
  "无效地址": "Invalid URL",
  "仅允许代理本站图床的媒体": "Only media hosted on this site can be proxied",
  "源站返回 {status}": "Origin returned {status}",
  "仅支持图片": "Only images are supported",
  "图片过大": "Image is too large",
  "拉取媒体失败": "Couldn't fetch the media",

  // 文档 / 版本 / 分享
  "文档不存在": "Document not found",
  "baseUpdatedAt 无法解析": "Couldn't parse baseUpdatedAt",
  "尚未创建分享": "No share link has been created yet",
  "版本不存在": "Version not found",
  "无权操作或批注不存在": "Not allowed, or the comment doesn't exist",
  "回复不能单独销记": "Replies can't be resolved on their own",
  "缺少 resolved 参数": "Missing resolved parameter",
  "分享不存在或已关闭": "This share doesn't exist or has been turned off",
  "该分享未开放批注": "Comments aren't enabled for this share",
  "批注内容不能为空": "Comment can't be empty",
  "批注不存在": "Comment not found",
  "缺少批注锚点": "Missing comment anchor",
  "该分享的批注数已达上限": "This share has reached its comment limit",

  // 飞书
  "请先保存你的飞书应用凭证": "Save your Feishu app credentials first",
  "App ID 不能为空": "App ID is required",
  "加载知识空间失败": "Couldn't load wiki spaces",
  "缺少知识空间 id": "Missing wiki space ID",
  "飞书授权": "Feishu Authorization",
  "登录状态已失效，请回到 xedit 重新登录后再连接飞书。":
    "Your session has expired. Go back to xedit, sign in again, then connect Feishu",
  "授权已取消或被拒绝，可关闭此窗口。": "Authorization was canceled or denied. You can close this window",
  "授权校验未通过（state 不匹配或已过期），请回到 xedit 重试。":
    "Authorization check failed (state mismatch or expired). Go back to xedit and try again",
  "{err}，请回到 xedit 重试。": "{err}. Go back to xedit and try again",
  "已连接飞书，此窗口即将自动关闭。": "Connected to Feishu. This window will close automatically",

  // 注册
  "邮箱格式不正确": "Invalid email address",
  "密码至少 8 位": "Password must be at least 8 characters",
  "密码过长": "Password is too long",
  "该邮箱已注册，请直接登录": "This email is already registered. Please sign in",

  // OAuth 授权（MCP 客户端接入）
  "未命名应用": "Unnamed App",
  "缺少 clientId": "Missing clientId",
  "无效的客户端": "Invalid Client",
  "client_id 未注册或不存在。": "This client_id isn't registered or doesn't exist",
  "回调地址不被允许": "Redirect URI Not Allowed",
  "redirect_uri 与注册值不匹配。": "The redirect_uri doesn't match the registered value",
  "授权访问": "Authorize Access",
  "{client} 请求以你的身份{email}访问 xedit 文档。授权后它可以：":
    "{client} is requesting access to your xedit documents as you{email}. Once authorized, it can:",
  "（{email}）": " ({email})",
  "查看、搜索你的文档": "View and search your documents",
  "创建、修改文档": "Create and edit documents",
  "把文档移入回收站（可恢复）": "Move documents to the trash (recoverable)",
  "查看、上传、删除图床图片": "View, upload and delete hosted images",
  "拒绝": "Deny",
  "允许": "Allow",
  "仅当你信任该应用时才授权。你可以随时在 xedit 设置里撤销此授权。":
    "Only authorize apps you trust. You can revoke this anytime in xedit settings",
};
