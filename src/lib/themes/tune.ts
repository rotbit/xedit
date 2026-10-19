// Typography tuning defaults. Kept in its own file (not in themes/index) because the store needs it too:
// index drags tens of KB of presets/base CSS literals into the module graph, and almost everything imports the store.

/** Typography tuning: body font size (px) / line height / paragraph spacing (px) */
export interface TuneValues {
  tuneFontSize: number;
  tuneLineHeight: number;
  tuneParaSpacing: number;
}

/** Default typography: shared by the store's initial value, the 「重置排版微调」 (Reset typography) button, and buildTuneCss's
 *  "emit nothing at defaults" check. These used to be separate literals, so changing one number left the others stale */
export const DEFAULT_TUNE: TuneValues = {
  tuneFontSize: 16,
  tuneLineHeight: 1.75,
  tuneParaSpacing: 16,
};
