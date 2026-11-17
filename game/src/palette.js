// EMBERLINE palette: a desert brickworks at golden hour — warm sand and brick,
// teal Vanguard against ember-orange Jackals.
export const PALETTE = {
  sky: 0xf6c489,
  fog: 0xe8b07e,
  sun: 0xffe3b3,
  sunIntensity: 2.4,
  hemiSky: 0xffd9a8,
  hemiGround: 0x8a5a38,
  hemiIntensity: 0.95,
  ambient: 0x604631,
  ambientIntensity: 0.5,

  sand: 0xc9a06a,
  sandDark: 0xa8824f,
  concrete: 0x9a938a,
  concreteDark: 0x6f6a63,
  brick: 0xa34d28,
  brickDark: 0x7e3a1e,
  brickLight: 0xc06a3a,
  rustMetal: 0x7a5236,
  steel: 0x5c6066,
  wood: 0x8a6a42,
  woodDark: 0x6b4f2e,
  kilnInner: 0x2b1410,

  vanguard: 0x2fa8d8,
  vanguardDark: 0x1c6f96,
  jackal: 0xe86a2c,
  jackalDark: 0xa8431a,
  accent: 0xffb347,
};

export const TEAM_COLORS = {
  vanguard: { main: PALETTE.vanguard, dark: PALETTE.vanguardDark, css: '#6fd3ff' },
  jackals: { main: PALETTE.jackal, dark: PALETTE.jackalDark, css: '#ff9a5c' },
};
