# Feature icon guidelines

xEdit's feature icons use Lucide: single-color line icons with round caps and round joins.
`LucideProvider` in `src/components/Providers.tsx` sets the defaults: size `16`, stroke `1.8`.
Icons inherit the text color of their control, so they follow the existing light/dark themes and interaction states.

## Sizes

| Size | Used for |
| --- | --- |
| 12 px | Helper arrows, compact states, secondary actions |
| 14 px | Menus, captions, panel headers |
| 16 px | Top toolbar, sidebar and primary actions |
| 18 px | Showcase feature icons, image viewer arrows |
| 20 / 24 px | Standalone graphics such as loading and empty states |

Pick the size by placement; don't mix 13, 15 or 17 px across similar controls.
Keep a button's existing hit area when changing its icon; regular icons shouldn't override the stroke width.
Small check marks that need to emphasize a selected state may keep a heavier stroke.

## AI features

Import `AiIcon` from `@/components/AiIcon`; it's a single soft-cornered star:

- The AI review entry in the top bar uses 16 px.
- The review panel, overall verdict, review progress, cover generation and admin AI settings use 14 px.
- AI features on the landing page use the same size as other features in their group.

The AI icon only marks a feature's identity: completion is still shown with a check mark, and loading with the existing animation.
Icon-only buttons need an accessible name; current state is still conveyed by background, hint text and ARIA attributes.

## Brand and content

The site logo, third-party login brand marks, document content and data charts are outside the feature icon system.
They keep their original paths, colors and sizes.
