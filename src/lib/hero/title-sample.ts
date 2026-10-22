/** Точки букв настоящего H1: каждое слово рисуется на offscreen canvas тем же шрифтом (начертание, кегль,
 *  трекинг берутся из вычисленного стиля H1) ровно в том месте, где браузер поставил это слово, — координаты
 *  от Range.getClientRects() каждого слова. Потом маска «прощупывается» сеткой с шагом `step`.
 *  Результат — пары (x, y) в CSS-пикселях относительно `origin` (левый верхний угол первого экрана).
 *  Вызывать после document.fonts.load(), иначе canvas нарисует запасным шрифтом. */

export interface TitleSample {
  /** x0, y0, x1, y1, … */
  points: Float32Array;
  /** рамка H1 относительно origin */
  box: { left: number; top: number; width: number; height: number };
  /** рамка реально закрашенных точек (для проверки совпадения с DOM) */
  ink: { left: number; top: number; right: number; bottom: number };
}

export function sampleTitle(h1: HTMLElement, origin: DOMRect, step: number): TitleSample {
  const cs = getComputedStyle(h1);
  const r = h1.getBoundingClientRect();
  const pad = 8;
  const scale = 2; // рисуем вдвое крупнее — края букв точнее
  const cw = Math.ceil((r.width + pad * 2) * scale);
  const ch = Math.ceil((r.height + pad * 2) * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(scale, scale);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const ls = cs.letterSpacing;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = ls === 'normal' ? '0px' : ls;
  ctx.fontKerning = 'normal';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';

  const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const text = node.data;
    const re = /\S+/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      const wr = rects[0];
      const tm = ctx.measureText(m[0]);
      const asc = tm.fontBoundingBoxAscent;
      const desc = tm.fontBoundingBoxDescent;
      const baseline = wr.top + (wr.height - (asc + desc)) / 2 + asc;
      ctx.fillText(m[0], wr.left - r.left + pad, baseline - r.top + pad);
    }
  }

  const data = ctx.getImageData(0, 0, cw, ch).data;
  const out: number[] = [];
  const ink = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const ox = r.left - origin.left - pad;
  const oy = r.top - origin.top - pad;
  // сетка со смещением в пределах ячейки — без «муара» ровных рядов
  for (let y = step / 2; y < ch / scale; y += step) {
    for (let x = step / 2; x < cw / scale; x += step) {
      const jx = x + (Math.random() - 0.5) * step * 0.6;
      const jy = y + (Math.random() - 0.5) * step * 0.6;
      const px = Math.min(cw - 1, Math.max(0, Math.round(jx * scale)));
      const py = Math.min(ch - 1, Math.max(0, Math.round(jy * scale)));
      if (data[(py * cw + px) * 4 + 3] < 140) continue;
      const gx = jx + ox;
      const gy = jy + oy;
      out.push(gx, gy);
      if (gx < ink.left) ink.left = gx;
      if (gx > ink.right) ink.right = gx;
      if (gy < ink.top) ink.top = gy;
      if (gy > ink.bottom) ink.bottom = gy;
    }
  }
  return {
    points: Float32Array.from(out),
    box: { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height },
    ink,
  };
}
