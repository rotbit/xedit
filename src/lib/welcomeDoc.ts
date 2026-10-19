/**
 * Welcome doc for new accounts. Generated once by the server at account creation (auth's createUser event);
 * the client no longer "adds one when the cloud looks empty" — longtime users who deleted all their articles got a new one on every sign-in.
 * Also used as the first doc in signed-out local mode.
 */

export const WELCOME_TITLE = "欢迎使用 xEdit";

export const DEFAULT_MARKDOWN = `# 欢迎使用 xEdit

一款 **Markdown 微信公众号排版工具**。左侧编辑，右侧实时预览，点击右上角「复制到公众号」即可粘贴进微信后台。

## 它能做什么

- 多套排版主题，代码高亮支持 Mac 风格窗口
- 外部链接自动转成文末[参考链接](https://github.com)
- 支持数学公式：$E = mc^2$
- 图片粘贴自动上传图床（需登录并配置阿里云 OSS）

> 登录 GitHub 账号后，文章自动保存到云端，多篇管理。

## 代码示例

\`\`\`javascript
function hello(name) {
  console.log(\`Hello, \${name}!\`);
}
hello("公众号");
\`\`\`

## 表格

| 功能 | 状态 |
| --- | --- |
| 公众号复制 | ✅ |
| 知乎复制 | ✅ |
| 云端同步 | ✅ |

$$
\\int_{-\\infty}^{+\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
$$
`;
