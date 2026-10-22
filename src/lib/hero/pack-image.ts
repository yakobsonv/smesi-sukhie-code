/** Разбор фото упаковки для витрины (без three): фото снято на белом фоне — белый фон, связанный с краем
 *  кадра, в полосе у края рамки (≤ 7 % ширины) заливается цветом края упаковки (светлый край — #ecebe7),
 *  кадр обрезается по упаковке; белое внутри упаковки не трогается. Заодно считаются средний цвет (им тонируются боковины, верх и зад мешка)
 *  и доминирующий насыщенный цвет (из него — ореол позади активного мешка). */

export type RGB = [number, number, number];

export interface PackImage {
  /** обрезанный по упаковке кадр с залитым фоном */
  canvas: HTMLCanvasElement;
  /** ширина / высота обрезанного кадра */
  aspect: number;
  /** средний цвет упаковки, 0…255 */
  mean: RGB;
  /** цвет ореола (доминирующий оттенок, приглушённый: без неона), 0…255 */
  glow: RGB;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`нет картинки ${src}`));
    img.src = src;
  });

function rgbToHsl(r: number, g: number, b: number): RGB {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export async function analysePack(src: string, opts: { fill?: boolean } = {}): Promise<PackImage> {
  const img = await loadImage(src);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const ctx = work.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const px = id.data;

  // 1. Фон: почти белые пиксели, связанные с краем кадра (заливка от краёв). Белый мешок
  //    внутри контура не трогаем — от фона его отделяет тень по контуру.
  const bg = new Uint8Array(w * h);
  const whiteish = (i: number) => {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const mn = Math.min(r, g, b);
    return mn >= 232 && Math.max(r, g, b) - mn <= 16;
  };
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (i: number) => { if (!bg[i] && whiteish(i)) { bg[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp) {
    const i = stack[--sp];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }

  // 2. Рамка упаковки — по пикселям вне заливки. Заливка могла затечь внутрь белой упаковки через светлый контур,
  //    поэтому фоном считаем только залитые пиксели в полосе у края рамки (≤ 7 % ширины) — белое внутри остаётся белым.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bg[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  const band = Math.max(2, Math.round((x1 - x0 + 1) * 0.07));
  const isBg = (x: number, y: number) =>
    bg[y * w + x] === 1 && Math.min(x - x0, x1 - x, y - y0, y1 - y) < band;

  // средний цвет и гистограмма оттенков насыщенных пикселей — по всей упаковке (включая белое внутри)
  let sr = 0, sg = 0, sb = 0, n = 0;
  const BINS = 24;
  const hw = new Float32Array(BINS);
  const hr = new Float32Array(BINS), hg = new Float32Array(BINS), hb = new Float32Array(BINS);
  let satW = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (isBg(x, y)) continue;
      const i = y * w + x;
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      sr += r; sg += g; sb += b; n++;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const v = max / 255;
      const s = max ? (max - min) / max : 0;
      if (s > 0.3 && v > 0.25 && v < 0.98) {
        const [hh] = rgbToHsl(r, g, b);
        const k = Math.min(BINS - 1, (hh * BINS) | 0);
        const wgt = s * v;
        hw[k] += wgt; hr[k] += r * wgt; hg[k] += g * wgt; hb[k] += b * wgt;
        satW += wgt;
      }
    }
  }
  if (!n) { n = 1; sr = sg = sb = 200; }
  const mean: RGB = [sr / n, sg / n, sb / n];

  // доминирующий оттенок: самая «тяжёлая» корзина вместе с соседками
  let best = -1, bestW = 0;
  for (let k = 0; k < BINS; k++) {
    const sum = hw[k] + 0.5 * (hw[(k + 1) % BINS] + hw[(k + BINS - 1) % BINS]);
    if (sum > bestW) { bestW = sum; best = k; }
  }
  let glow: RGB;
  if (best >= 0 && satW > n * 0.04) {
    const [gh, gs] = rgbToHsl(hr[best] / hw[best], hg[best] / hw[best], hb[best] / hw[best]);
    // приглушаем: насыщенность ≤ 0,42, светлота 0,42 — мягкий ореол, а не игровое свечение
    glow = hslToRgb(gh, Math.min(0.42, Math.max(0.25, gs)), 0.42);
  } else {
    const [mh, ms] = rgbToHsl(...mean);
    glow = hslToRgb(mh, Math.min(0.2, ms), 0.45);
  }

  // 3. Фон в полосе у края → цвет края упаковки (в 3 px от контура, мимо обводки-тени); светлый край — светлый
  //    нейтральный #ecebe7. Позиции из SHOWCASE.noFill не заливаются (белые углы остаются белыми).
  if (opts.fill !== false) {
    let er = 0, eg = 0, eb = 0, en = 0;
    const take = (x: number, y: number) => {
      const i = y * w + x;
      er += px[i * 4]; eg += px[i * 4 + 1]; eb += px[i * 4 + 2]; en++;
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) if (!isBg(x, y)) { take(Math.min(x1, x + 3), y); break; }
      for (let x = x1; x >= x0; x--) if (!isBg(x, y)) { take(Math.max(x0, x - 3), y); break; }
    }
    let fill: RGB = en ? [er / en, eg / en, eb / en] : [236, 235, 231];
    const luma = (0.2126 * fill[0] + 0.7152 * fill[1] + 0.0722 * fill[2]) / 255;
    if (luma > 0.75) fill = [236, 235, 231];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!isBg(x, y)) continue;
        const i = y * w + x;
        px[i * 4] = fill[0]; px[i * 4 + 1] = fill[1]; px[i * 4 + 2] = fill[2]; px[i * 4 + 3] = 255;
      }
    }
  }
  ctx.putImageData(id, 0, 0);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  out.getContext('2d')!.drawImage(work, x0, y0, cw, ch, 0, 0, cw, ch);
  return { canvas: out, aspect: cw / ch, mean, glow };
}
