# scripts

## build-brand-assets.mjs — brand wordmark and app icons

`public/logo.svg` is the approved "open page" icon plus the xEdit wordmark; `public/logo-mark.svg` is the standalone page icon.
Both sources share the same page outline: `page_right` is bright blue, `page_left` is mint teal, and `wordmark` stays ink-colored.
After editing the sources, run:

```bash
node scripts/build-brand-assets.mjs
# Also update the sibling desktop repo (ICNS generation needs macOS's built-in iconutil):
node scripts/build-brand-assets.mjs ../xedit-desktop
```

The script reuses the project's sharp to generate `src/lib/brand.ts`, the web icons and, optionally, the desktop splash assets,
Dock PNG and an ICNS containing 16–1024 px sizes. In-page logo colors are controlled by `--brand-mark` and `--brand-mark-secondary` in `globals.css`:
bright blue `#3478f6` and mint teal `#20b8a6` in the light theme, `#80adff` and `#58dac5` in the dark theme;
the text follows the body color via `currentColor`. Exported icons read the SVG fills and sit on an ice-white `#f5faff` background.

## og-source.html — source for the social share card (public/og.png)

`public/og.png` is a 1200×630 screenshot of this HTML file. After changing the copy, regenerate it:

```bash
# 1. Start a static server (from this directory)
python3 -m http.server 3211 --directory ..

# 2. Open http://localhost:3211/scripts/og-source.html in a browser with a 1200×630 viewport and take a screenshot,
#    or use any headless screenshot tool, e.g.:
#    npx playwright screenshot --viewport-size=1200,630 http://localhost:3211/scripts/og-source.html og.png

# 3. Check the size and move it into place
sips -g pixelWidth -g pixelHeight og.png
mv og.png ../public/og.png
```

Changes apply to both the Open Graph and Twitter cards (referenced by `OG_IMAGE` in `src/lib/site.ts`).
