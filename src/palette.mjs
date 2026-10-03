// Colours. Anthropic's slate / ivory / clay for the film, Claude Code's own dark-theme colours for its UI.
export const P = {
  void: 0x0b0b0a,      // before power-on, behind takeovers
  bg: 0x141413,        // the terminal
  bg2: 0x1b1a18,       // raised surfaces
  bg3: 0x262624,       // user messages, panels
  grid: 0x1f1e1c,      // background dot grid
  line: 0x3d3d3a,      // rules and frames
  dim: 0x5e5d59,
  mute: 0x87867f,
  soft: 0xb0aea5,
  text: 0xe8e6dc,
  white: 0xfaf9f5,

  clay: 0xd97757,      // Claude
  clayHi: 0xeb9f7f,    // spinner shimmer
  clayLo: 0x9c4f36,
  clayDeep: 0x5a2c1e,
  kraft: 0xd4a27f,
  manilla: 0xebdbbc,
  gold: 0xe5b567,
  goldHi: 0xffe3a3,
  olive: 0x788c5d,
  sky: 0x6a9bcc,       // you
  skyHi: 0x9cc3e8,
  heather: 0xcbcadb,
  fig: 0xc46686,       // love

  // Claude Code (dark theme)
  ok: 0x4eba65,
  err: 0xff6b80,
  warn: 0xffc107,
  perm: 0xb1b9f9,
  plan: 0x48968c,
  accept: 0xaf87ff,
  bash: 0xfd5db1,
  diffAdd: 0x225c2b,
  diffDel: 0x7a2936,
  diffAddW: 0x38a660,
  diffDelW: 0xb3596b,
  inactive: 0x999999,
  subtle: 0x505050,
  userBg: 0x232220,    // your messages in the transcript
};

// Claude Code's light theme on Anthropic's ivory, for the page of the own-style film (src/own/). Keys mean the
// same roles as above: "Hi" is the more prominent variant, "Deep" the quiet one, "white" the strongest ink.
const LIGHT = {
  void: 0xf0eee6, bg: 0xfaf9f5, bg2: 0xf3f1ea, bg3: 0xe8e6dc, grid: 0xefede6, line: 0xd8d6cc,
  dim: 0xb4b2a9, mute: 0x8a8880, soft: 0x5e5d59, text: 0x1f1e1d, white: 0x0d0d0c,
  clay: 0xd97757, clayHi: 0xc4613f, clayLo: 0xe9a98f, clayDeep: 0xf6e3da, kraft: 0xa8835f, manilla: 0x7d6446,
  gold: 0xb8862b, goldHi: 0x9a6c16, olive: 0x5f7346, sky: 0x4a86c2, skyHi: 0x2f6aa6, heather: 0x6c6a85,
  fig: 0xb04f73, ok: 0x2e8b46, err: 0xcf3a50, warn: 0xb7791f, perm: 0x5865c9, plan: 0x2f7d74, accept: 0x7c4dd6,
  bash: 0xd6337f, diffAdd: 0xdcefdf, diffDel: 0xf6dce0, diffAddW: 0x2e8b46, diffDelW: 0xb03a4f,
  inactive: 0x9a9a9a, subtle: 0xd0d0d0, userBg: 0xefede6,
};
const DARK = { ...P };
/** Switch the palette in place (every module reads P at draw time). */
export function setTheme(name) { Object.assign(P, name === 'light' ? LIGHT : DARK); }

// JSON / code syntax colours
export const SYN = { key: 0x9cc3e8, str: 0xd4a27f, num: 0xcbcadb, punct: 0x87867f, kw: 0xd97757, com: 0x5e5d59 };
