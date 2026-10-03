// Facts both panes share, so the session on the left and the shots on the right agree.
import { clamp } from './gfx.mjs';

/** Pretraining checkpoint shown from the first reply (≈14 s) to "L9 If I'm…" (≈29.3 s). */
export function ckptAt(t) {
  const p = clamp((t - 14.0) / 15.3);
  return Math.round(512 + 818688 * p * p);
}
export const fmtCkpt = (n) => `ckpt-${String(n).padStart(6, '0')}`;

/** A2: you resend 你好 every two bars; her improved reply starts on these beats (the portrait sharpens). */
export const A2_SENDS = [38, 46, 54];       // beat numbers of each resend
export const A2_REPLIES = [39, 47, 55, 63]; // beat numbers where a better checkpoint answers (63 = last, best)

/** SFT and RL step counters. */
export const sftStep = (t, a, b) => Math.round(1200 * clamp((t - a) / (b - a)));
export const rlStep = (t, a, b) => Math.round(640 * clamp((t - a) / (b - a)));

/** Monotone cubic interpolation through [x, y] keys (same curve as the right pane's clock). */
export function pchip(keys) {
  const n = keys.length;
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (x) => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (x > keys[i + 1][0]) i++;
    const h = keys[i + 1][0] - keys[i][0], u = (x - keys[i][0]) / h;
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
    return h00 * keys[i][1] + h10 * h * m[i] + h01 * keys[i + 1][1] + h11 * h * m[i + 1];
  };
}

/** "A day in a minute": minutes past midnight at song time t; lands on each memory write (07:30 … 23:10). */
export function dayClock(W) {
  const at = [W(43, 0), W(43, 2), W(43, 3), W(44, 1), W(44, 3)];
  const mins = [450, 730, 1122, 1265, 1390];
  const f = pchip([...at.map((t, i) => [t, mins[i]]), [W(45, 0), 1390]]);
  return (t) => {
    const m = Math.round(f(t));
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
}
