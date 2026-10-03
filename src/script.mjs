// The whole film: the session (left), the shots (right) and the takeovers, registered on a Film.
import { register as left } from './left.mjs';
import { register as shotsA } from './shots/a.mjs';
import { register as shotsBC } from './shots/bc.mjs';
import { register as shotsDG } from './shots/dg.mjs';
import { register as takeovers } from './takeovers.mjs';

export function build(film) {
  left(film);
  shotsA(film);
  shotsBC(film);
  shotsDG(film);
  takeovers(film);
}
