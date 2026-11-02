// The app's icons: one set, drawn on a 24px grid with a 1.8 stroke and round ends, in the text colour. They replace
// emoji, which look different on every phone. Each icon says what it stands for (a pair of scissors for the barber,
// not a decoration); a category with no match shows a plain dot.

const p = (d) => `<path d="${d}"/>`;
const c = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const r = (x, y, w, h, rx = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;

const SHAPES = {
  coins: c(9, 9, 5.5) + p('M14.2 5.4A5.5 5.5 0 1 1 9.6 14.9') + p('M9 6.8v4.4M7.2 9h3.6'),
  utensils: p('M7 3v6a2 2 0 0 1-2 2M7 3v6a2 2 0 0 0 2 2M5 3v6M9 3v6M7 11v10') + p('M17 3c-2.2 1.8-3 4.2-3 7.2h3V21'),
  cart: c(9, 20, 1.4) + c(18, 20, 1.4) + p('M3 4h2.4l2.3 11h10.4l2-8.2H6.1'),
  bag: p('M5 8h14l-1 12.5H6L5 8z') + p('M9 8V6.5a3 3 0 0 1 6 0V8'),
  car: p('M4.5 16.5V12l1.8-5h11.4l1.8 5v4.5') + p('M3 16.5h18v3H3z') + p('M4.5 12h15') + c(7.5, 14.3, .6) + c(16.5, 14.3, .6),
  bus: r(4, 3.5, 16, 14, 2.5) + p('M4 11h16M8 21v-3.5M16 21v-3.5') + c(8, 14.2, .7) + c(16, 14.2, .7),
  play: c(12, 12, 9) + p('M10 8.5l5.5 3.5-5.5 3.5z'),
  dice: r(4, 4, 16, 16, 3) + c(9, 9, .9) + c(15, 15, .9) + c(12, 12, .9),
  book: p('M4 5.5C4 4.7 4.7 4 5.5 4H19v14.5H6a2 2 0 0 0-2 2V5.5z') + p('M6 18.5h13M8.5 8h7'),
  heart: p('M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z'),
  drop: p('M12 3.5S6 10.2 6 14.5a6 6 0 0 0 12 0C18 10.2 12 3.5 12 3.5z') + p('M9.5 15a2.6 2.6 0 0 0 2.5 2.4'),
  scissors: c(6.5, 7, 2.6) + c(6.5, 17, 2.6) + p('M8.6 8.6L20 18M8.6 15.4L20 6'),
  receipt: p('M6 3h12v18l-2.4-1.6L13.2 21 12 19.9 10.8 21l-2.4-1.6L6 21V3z') + p('M9 8h6M9 12h6M9 16h3'),
  phone: r(7, 2.5, 10, 19, 2.5) + p('M10.5 18.5h3'),
  home: p('M3.5 11L12 4l8.5 7') + p('M5.5 9.7V20h13V9.7') + p('M10 20v-5.5h4V20'),
  shirt: p('M8.5 3.5L3.5 7l2.2 3.6L8 9.5V20.5h8V9.5l2.3 1.1L20.5 7l-5-3.5c-.5 1.4-1.9 2.2-3.5 2.2s-3-.8-3.5-2.2z'),
  ticket: p('M3.5 8.5V6.5h17v2a2.5 2.5 0 0 0 0 5v4h-17v-4a2.5 2.5 0 0 0 0-5z') + p('M14 6.5v11'),
  gift: r(3.5, 8.5, 17, 4.5, 1) + p('M5 13v7.5h14V13M12 8.5v12') + p('M12 8.5C9.5 8.5 8 7.4 8 6s1-2.3 2.2-2.3C11.6 3.7 12 6 12 8.5zM12 8.5c2.5 0 4-1.1 4-2.5s-1-2.3-2.2-2.3C12.4 3.7 12 6 12 8.5z'),
  users: c(9, 8.5, 3) + p('M3.5 19.5c.4-3 2.6-4.8 5.5-4.8s5.1 1.8 5.5 4.8') + c(17, 9.5, 2.4) + p('M16.5 14.8c2.4-.2 4.2 1.3 4.6 4'),
  cap: p('M2.5 9.5L12 5l9.5 4.5L12 14 2.5 9.5z') + p('M6.5 11.7V16c0 1.2 2.6 2.5 5.5 2.5s5.5-1.3 5.5-2.5v-4.3') + p('M21.5 9.5v5'),
  bank: p('M3.5 9.5L12 4l8.5 5.5z') + p('M5.5 9.5V17M9.5 9.5V17M14.5 9.5V17M18.5 9.5V17M3.5 20h17M4.5 17h15'),
  briefcase: r(3.5, 7.5, 17, 12, 2) + p('M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 13h17'),
  laptop: r(5, 5.5, 14, 9.5, 1.5) + p('M2.5 18.5h19'),
  trend: p('M3.5 17L9.5 11l4 4 7-8') + p('M15 7h5.5v5.5'),
  undo: p('M9 6.5L4.5 11 9 15.5') + p('M4.5 11h9a6 6 0 0 1 0 12h-3'),
  scale: p('M12 4v16M7 20h10M6 7h12') + p('M6 7l-3 7a3 3 0 0 0 6 0L6 7zM18 7l-3 7a3 3 0 0 0 6 0l-3-7z'),
  swap: p('M4 8h14M14.5 4.5L18 8l-3.5 3.5') + p('M20 16H6M9.5 12.5L6 16l3.5 3.5'),
  box: p('M3.5 8L12 4l8.5 4v8.5L12 20.5 3.5 16.5V8z') + p('M3.5 8L12 12l8.5-4M12 12v8.5'),
  dot: c(12, 12, 2),
  lifebuoy: c(12, 12, 8.5) + c(12, 12, 3.4) + p('M6 6l3.6 3.6M18 6l-3.6 3.6M6 18l3.6-3.6M18 18l-3.6-3.6'),
  banknote: r(3, 6.5, 18, 11, 2) + c(12, 12, 2.6) + p('M6.5 10v4M17.5 10v4'),
  card: r(3, 5.5, 18, 13, 2.5) + p('M3 10h18M7 15h3'),
  wallet: p('M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3') + p('M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5h12.5v-11H6.5A2.5 2.5 0 0 1 4 6') + c(16, 14, .9),
  safe: r(3.5, 4.5, 17, 15, 2.5) + c(12, 12, 3.4) + p('M12 12l1.8-1.8M7 19.5v1.5M17 19.5v1.5'),
  shield: p('M12 3.5l7 2.6v5.4c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.1l7-2.6z') + p('M8.8 12l2.3 2.3 4.2-4.6'),
  mail: r(3, 5.5, 18, 13, 2.5) + p('M3.5 7.5l8.5 6 8.5-6'),
  alert: p('M12 3.5l9.5 16.5h-19L12 3.5z') + p('M12 10v4.5') + c(12, 17.2, .5),
  tag: p('M3.5 12.5V4.5h8l9 9-8 8-9-9z') + c(8, 9, 1.2),
  idcard: r(3, 5.5, 18, 13, 2.5) + c(9, 11.3, 2) + p('M5.8 16c.5-1.7 1.8-2.4 3.2-2.4s2.7.7 3.2 2.4M14.5 10h4M14.5 13.5h3'),
  calendar: r(3.5, 5, 17, 15.5, 2.5) + p('M3.5 10h17M8 3v4M16 3v4'),
  flame: p('M12 21c-3.8 0-6.5-2.6-6.5-6.2 0-3 2-4.8 3.4-6.6C10 6.7 10.5 5.2 10.3 3c3.6 1.5 7.2 5.6 7.2 11 0 3.9-2.6 7-5.5 7z') + p('M12 21c-1.7 0-2.8-1.2-2.8-2.8 0-1.5 1.2-2.3 2-3.6 1.8 1 3.6 2.7 3.6 4.6 0 1-.9 1.8-2.8 1.8z'),
  check: p('M5 12.5l4.5 4.5L19 7.5'),
  bell: p('M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2z') + p('M10 21h4'),
  pill: r(2.5, 8.5, 19, 7, 3.5).replace('<rect ', '<rect transform="rotate(-35 12 12)" ') + p('M12 7.6l1.9 2.6'),
  eye: p('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z') + c(12, 12, 3),
};

export const ICON_NAMES = Object.keys(SHAPES);

/** An icon as inline SVG (aria-hidden: the words next to it carry the meaning). Unknown names give the dot. */
export function svgIcon(name) {
  const body = SHAPES[name] || SHAPES.dot;
  return `<svg class="ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
