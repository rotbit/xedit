# scripts

## build-brand-assets.mjs — 品牌字标与应用图标

`public/logo.svg` 是已确认的「展页」图标与 xEdit 字标，`public/logo-mark.svg` 是独立书页图标。
两份源图保留相同的书页轮廓；`mark` 与 `wordmark` 路径分别使用靛蓝与墨色。
修改源图后运行：

```bash
node scripts/build-brand-assets.mjs
# 同时更新相邻桌面仓库（ICNS 生成需要 macOS 自带 iconutil）：
node scripts/build-brand-assets.mjs ../xedit-desktop
```

脚本复用项目中的 sharp，生成 `src/lib/brand.ts`、网页图标，以及可选的桌面启动页资源、
Dock PNG 和包含 16–1024 像素的 ICNS。网页图标颜色由 `globals.css` 的 `--brand-mark` 控制：
浅色主题为靛蓝 `#48478f`，深色主题为浅色；文字通过 `currentColor` 跟随正文颜色。

## og-source.html — 社交分享卡片（public/og.png）的源文件

`public/og.png` 是这张 HTML 的截图，1200×630。改完文案后重新生成：

```bash
# 1. 起一个静态服务（这个目录下）
python3 -m http.server 3211 --directory ..

# 2. 用浏览器把视口调成 1200×630 打开 http://localhost:3211/scripts/og-source.html 截图，
#    或用任意 headless 截图工具，例如：
#    npx playwright screenshot --viewport-size=1200,630 http://localhost:3211/scripts/og-source.html og.png

# 3. 确认尺寸并落位
sips -g pixelWidth -g pixelHeight og.png
mv og.png ../public/og.png
```

改动会同时反映到 Open Graph 与 Twitter 卡片上（引用处见 `src/lib/site.ts` 的 `OG_IMAGE`）。
