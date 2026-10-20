/** «Сыплется сухая смесь» — 2D canvas без библиотек, слоем под текстом первого экрана главной.
 *
 *  Как устроено:
 *  - зёрна живут в типизированных массивах (x, y, скорость, состояние, цвет, размер) — на кадр
 *    не создаётся ни одного объекта; удаление — перестановкой последнего на место удалённого;
 *  - куча — карта высот по колонкам (Float32Array). Зерно, коснувшись кучи, скатывается в сторону
 *    более низкой соседки, пока склон круче естественного откоса или колонка уже полная, и ложится
 *    там (высота колонки растёт). Полная куча = треугольник с откосом `slope`, вершина — `peak`
 *    высоты экрана, и нигде не выше линии «низ текста/кнопок минус отступ» — куча не заходит под текст;
 *  - когда куча насыпана, лишние зёрна растворяются при ударе, часть докатывается до подножия и там исчезает;
 *  - пыль — отдельные мягкие полупрозрачные пятна с коротким временем жизни;
 *  - рисуем через requestAnimationFrame; цикл стоит, когда первый экран вне экрана, вкладка скрыта
 *    или нажата пауза; при prefers-reduced-motion — один раз рисуется уже насыпанная куча.
 *  Параметры — src/lib/pour-config.ts. */

import { POUR, type PourMode } from './pour-config';

export interface PourStats {
  frames: number;
  grains: number;
  dust: number;
  /** время шага + отрисовки последнего кадра и максимум за всё время, мс */
  stepMs: number;
  maxStepMs: number;
  running: boolean;
  /** насколько насыпана куча: 0…1 */
  fill: number;
  /** высота вершины кучи сейчас, px */
  heapTop: number;
  mode: 'desktop' | 'mobile' | '';
  reduced: boolean;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function startPour(hero: HTMLElement, canvas: HTMLCanvasElement, toggle: HTMLButtonElement | null): PourStats | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const stats: PourStats = { frames: 0, grains: 0, dust: 0, stepMs: 0, maxStepMs: 0, running: false, fill: 0, heapTop: 0, mode: '', reduced };

  // ── Цвета зёрен: цвет × оттенок яркости = «ведро»; рисуем по вёдрам, чтобы не менять fillStyle на каждое зерно
  const palette: string[] = [];
  const bucketWeight: number[] = [];
  for (const c of POUR.colors) {
    const [r, g, b] = hexToRgb(c.hex);
    for (const k of POUR.shades) {
      palette.push(`rgb(${Math.round(r * k)} ${Math.round(g * k)} ${Math.round(b * k)})`);
      bucketWeight.push(c.weight / POUR.shades.length);
    }
  }
  const cumulative = new Float32Array(bucketWeight.length);
  bucketWeight.reduce((s, w, i) => (cumulative[i] = s + w), 0);
  const pickBucket = () => {
    const x = Math.random() * cumulative[cumulative.length - 1];
    for (let i = 0; i < cumulative.length; i++) if (x <= cumulative[i]) return i;
    return 0;
  };

  // ── Зёрна
  const CAP = Math.max(POUR.desktop.maxGrains, POUR.mobile.maxGrains);
  const gx = new Float32Array(CAP);
  const gy = new Float32Array(CAP);
  const gvx = new Float32Array(CAP);
  const gvy = new Float32Array(CAP);
  const gph = new Float32Array(CAP); // фаза ветра; у скатывающегося — время на склоне
  const gst = new Uint8Array(CAP); // 0 — летит, 1 — скатывается
  const gcol = new Uint8Array(CAP); // ведро цвета
  const gsz = new Uint8Array(CAP); // размер, физические пиксели
  let n = 0;

  const killGrain = (i: number) => {
    const j = --n;
    if (i === j) return;
    gx[i] = gx[j]; gy[i] = gy[j]; gvx[i] = gvx[j]; gvy[i] = gvy[j];
    gph[i] = gph[j]; gst[i] = gst[j]; gcol[i] = gcol[j]; gsz[i] = gsz[j];
  };

  // ── Пыль
  const DCAP = Math.max(POUR.desktop.maxDust, POUR.mobile.maxDust);
  const dx = new Float32Array(DCAP);
  const dy = new Float32Array(DCAP);
  const dvx = new Float32Array(DCAP);
  const dvy = new Float32Array(DCAP);
  const dage = new Float32Array(DCAP);
  const dlife = new Float32Array(DCAP);
  const dsize = new Float32Array(DCAP);
  const dalpha = new Float32Array(DCAP);
  let nd = 0;

  const killDust = (i: number) => {
    const j = --nd;
    if (i === j) return;
    dx[i] = dx[j]; dy[i] = dy[j]; dvx[i] = dvx[j]; dvy[i] = dvy[j];
    dage[i] = dage[j]; dlife[i] = dlife[j]; dsize[i] = dsize[j]; dalpha[i] = dalpha[j];
  };

  // ── Раскладка: размеры, «жерло», карта высот, запретные зоны текста
  let W = 0;
  let H = 0;
  let dpr = 1;
  let mode: PourMode = POUR.desktop;
  let x0 = 0;
  let drift = 0;
  let cw = 3;
  let cols = 0;
  let cFrom = 0;
  let cTo = 0;
  let heap = new Float32Array(0);
  let target = new Float32Array(0);
  let targetSum = 0;
  let heapSum = 0;
  let peakH = 0;
  let dh = 1;
  let rects = new Float32Array(0); // l, t, r, b — текст и кнопки (с отступом), в координатах первого экрана
  let pattern: CanvasPattern | null = null;
  let shade: CanvasGradient | null = null;
  let sprite: HTMLCanvasElement | null = null;
  let laidOut = false;

  const makeTexture = () => {
    const s = 96;
    const off = document.createElement('canvas');
    off.width = s;
    off.height = s;
    const o = off.getContext('2d')!;
    o.fillStyle = '#a19d94';
    o.fillRect(0, 0, s, s);
    const dot = dpr >= 1.5 ? 2 : 1;
    for (let k = 0; k < 1700; k++) {
      const [r, g, b] = hexToRgb(POUR.colors[pickBucket() / POUR.shades.length | 0].hex);
      const m = rnd(0.62, 1.02);
      o.fillStyle = `rgb(${Math.min(255, r * m) | 0} ${Math.min(255, g * m) | 0} ${Math.min(255, b * m) | 0})`;
      o.fillRect((Math.random() * s) | 0, (Math.random() * s) | 0, dot, dot);
    }
    pattern = ctx.createPattern(off, 'repeat');
    pattern?.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));

    sprite = document.createElement('canvas');
    sprite.width = sprite.height = 32;
    const sp = sprite.getContext('2d')!;
    const rg = sp.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgb(232 228 218 / 1)');
    rg.addColorStop(0.5, 'rgb(232 228 218 / 0.45)');
    rg.addColorStop(1, 'rgb(232 228 218 / 0)');
    sp.fillStyle = rg;
    sp.fillRect(0, 0, 32, 32);
  };

  const layout = () => {
    const box = hero.getBoundingClientRect();
    const newW = hero.clientWidth;
    const newH = hero.clientHeight;
    if (!newW || !newH) return;
    const newDpr = Math.min(POUR.maxDpr, window.devicePixelRatio || 1);
    const dprChanged = newDpr !== dpr || !pattern;
    W = newW;
    H = newH;
    dpr = newDpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (dprChanged) makeTexture();

    const desk = W >= POUR.desktopFrom;
    mode = desk ? POUR.desktop : POUR.mobile;
    stats.mode = desk ? 'desktop' : 'mobile';
    if (n > mode.maxGrains) n = mode.maxGrains;
    if (nd > mode.maxDust) nd = mode.maxDust;

    // Запретные зоны: строки текста (по строкам, а не по блокам) и кнопки — с отступом 6 px.
    const pad = 6;
    const list: number[] = [];
    const add = (b: DOMRect) => {
      if (b.width && b.height) list.push(b.left - box.left - pad, b.top - box.top - pad, b.right - box.left + pad, b.bottom - box.top + pad);
    };
    hero.querySelectorAll('.hero__kicker, .hero__title, .hero__lead').forEach((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const b of range.getClientRects()) add(b);
    });
    hero.querySelectorAll('.hero__actions a').forEach((el) => add(el.getBoundingClientRect()));
    rects = Float32Array.from(list);

    // «Жерло»: на ПК — щель между 2-м и 3-м столбцами упаковок, иначе — середина левого поля.
    const packs = hero.querySelectorAll<HTMLElement>('.hero__packs li');
    let half: number;
    if (packs.length >= 3 && packs[1].offsetParent && packs[1].getBoundingClientRect().width) {
      const a = packs[1].getBoundingClientRect();
      const b = packs[2].getBoundingClientRect();
      x0 = (a.right + b.left) / 2 - box.left;
      half = (b.left - a.right) / 2;
    } else {
      const text = hero.querySelector('.hero__text')?.getBoundingClientRect();
      half = text ? (text.left - box.left) / 2 : 8;
      x0 = half;
    }
    drift = Math.max(0, Math.min(mode.drift, half - 2.5));

    // Карта высот: полная куча — треугольник с откосом slope, вершина не выше peak·H
    // и ни в одной колонке не выше «низ текста над ней − отступ».
    const oldTarget = targetSum;
    const oldFill = oldTarget > 0 ? heapSum / oldTarget : 0;
    cw = mode.col;
    cols = Math.ceil(W / cw);
    const cap = new Float32Array(cols).fill(H * mode.peak);
    for (let k = 0; k < rects.length; k += 4) {
      const l = Math.max(0, Math.floor(rects[k] / cw));
      const r = Math.min(cols - 1, Math.floor(rects[k + 2] / cw));
      const limit = Math.max(0, H - rects[k + 3] - POUR.textGap);
      for (let c = l; c <= r; c++) if (cap[c] > limit) cap[c] = limit;
    }
    peakH = H * mode.peak;
    for (let c = 0; c < cols; c++) {
      const v = cap[c] + mode.slope * Math.abs((c + 0.5) * cw - x0);
      if (v < peakH) peakH = v;
    }
    target = new Float32Array(cols);
    heap = new Float32Array(cols);
    targetSum = 0;
    cFrom = cols;
    cTo = -1;
    // склоны чуть неровные (только вниз от треугольника — предел высоты не нарушается)
    const p1 = rnd(0, 6.283);
    const p2 = rnd(0, 6.283);
    for (let c = 0; c < cols; c++) {
      const d = (c + 0.5) * cw - x0;
      const near = Math.min(1, Math.abs(d) / 40); // у вершины — ровно, к подножию — неровнее
      const bumps = 1 - near * (0.045 * (1 + Math.sin(d * 0.045 + p1)) + 0.025 * (1 + Math.sin(d * 0.13 + p2)));
      const v = Math.max(0, (peakH - mode.slope * Math.abs(d)) * bumps);
      target[c] = v;
      targetSum += v;
      if (v > 0) { if (c < cFrom) cFrom = c; cTo = c; }
    }
    // Куча сохраняет насыпанную долю при смене размера; без движения — сразу полная.
    const f = reduced ? 1 : oldFill;
    heapSum = 0;
    for (let c = 0; c < cols; c++) {
      heap[c] = target[c] * f * (reduced ? rnd(0.94, 1) : 1);
      heapSum += heap[c];
    }
    dh = targetSum / (mode.rate * POUR.fillSeconds);

    shade = ctx.createLinearGradient(0, H - Math.max(peakH, 1), 0, H);
    shade.addColorStop(0, 'rgb(21 25 28 / 0)');
    shade.addColorStop(1, `rgb(21 25 28 / ${POUR.heapShadeBottom})`);
    laidOut = true;
  };

  const inText = (x: number, y: number, m: number) => {
    for (let k = 0; k < rects.length; k += 4) {
      if (x > rects[k] - m && x < rects[k + 2] + m && y > rects[k + 1] - m && y < rects[k + 3] + m) return true;
    }
    return false;
  };

  const spawnDust = (x: number, y: number, scale: number) => {
    if (nd >= mode.maxDust) return;
    const i = nd++;
    dx[i] = x + rnd(-3, 3);
    dy[i] = y - rnd(0, 3);
    dvx[i] = rnd(-28, 28);
    dvy[i] = -rnd(6, 28) * scale;
    dage[i] = 0;
    dlife[i] = rnd(POUR.dustLife[0], POUR.dustLife[1]);
    dsize[i] = rnd(POUR.dustSize[0], POUR.dustSize[1]) * scale;
    dalpha[i] = rnd(POUR.dustAlpha[0], POUR.dustAlpha[1]);
  };

  // ── Шаг симуляции
  let acc = 0;
  let clock = 0;
  const step = (dt: number) => {
    clock += dt;
    const ramp = Math.min(1, clock / POUR.rampSeconds);
    acc += mode.rate * ramp * dt;
    const sizes = dpr >= 1.5 ? POUR.grainPx.x2 : POUR.grainPx.x1;
    while (acc >= 1) {
      acc -= 1;
      if (n >= mode.maxGrains) continue;
      const i = n++;
      const jitter = Math.sin(clock * 1.7) * 0.8 + Math.sin(clock * 4.3 + 1) * 0.5 + rnd(-0.8, 0.8);
      gx[i] = x0 + Math.max(-drift, Math.min(drift, jitter));
      gy[i] = -rnd(0, 6);
      gvx[i] = rnd(-3, 3);
      gvy[i] = rnd(POUR.launch[0], POUR.launch[1]);
      gph[i] = rnd(0, 6.283);
      gst[i] = 0;
      gcol[i] = pickBucket();
      gsz[i] = Math.random() < 0.5 ? sizes[0] : sizes[1];
      if (Math.random() < POUR.dustAtMouth) spawnDust(gx[i], 4, 0.5);
    }

    const full = targetSum > 0 && heapSum >= targetSum * 0.985;
    const g = POUR.gravity;
    const drag = POUR.drag;
    const wind = POUR.wind;
    const left = x0 - drift;
    const right = x0 + drift;
    const slope = mode.slope * cw;
    const sl = POUR.slide;

    for (let i = n - 1; i >= 0; i--) {
      if (gst[i] === 0) {
        // Летит: тяжесть, сопротивление воздуха, лёгкий ветер; вбок — не дальше drift
        const ax = wind * Math.sin(gy[i] * 0.012 + clock * 1.3 + gph[i]);
        gvx[i] += (ax - gvx[i] * 3) * dt;
        gvy[i] += (g - drag * gvy[i]) * dt;
        let x = gx[i] + gvx[i] * dt;
        if (x < left) { x = left; gvx[i] = 0; } else if (x > right) { x = right; gvx[i] = 0; }
        gx[i] = x;
        const y = gy[i] + gvy[i] * dt;
        const c = (x / cw) | 0;
        const surface = c >= 0 && c < cols ? H - heap[c] : H;
        if (y < surface) { gy[i] = y; continue; }
        // Коснулось кучи (или низа экрана)
        gy[i] = surface;
        if (Math.random() < POUR.dustOnImpact) spawnDust(x, surface, 1);
        if (c < 0 || c >= cols || target[c] <= 0 || (full && Math.random() > POUR.rollWhenFull)) { killGrain(i); continue; }
        gst[i] = 1;
        gph[i] = 0;
        // край экрана — стенка: куча прислоняется к ней, а не «стекает» за край
        const hl = c > 0 ? heap[c - 1] : heap[c] + 1e3;
        const hr = c < cols - 1 ? heap[c + 1] : heap[c] + 1e3;
        gvx[i] = (hl < hr ? -1 : hr < hl ? 1 : Math.random() < 0.5 ? -1 : 1) * sl.start;
        continue;
      }

      // Скатывается: ложится, где колонка не полная и склон не круче откоса; иначе катится дальше вниз
      const c = (gx[i] / cw) | 0;
      if (c < 0 || c >= cols || target[c] <= 0) { killGrain(i); continue; }
      gph[i] += dt;
      const h = heap[c];
      const hl = c > 0 ? heap[c - 1] : h + 1e3;
      const hr = c < cols - 1 ? heap[c + 1] : h + 1e3;
      const lim = slope * rnd(0.8, 1.3);
      if (h + dh <= target[c] && h - hl <= lim && h - hr <= lim) {
        heap[c] = h + dh;
        heapSum += dh;
        killGrain(i);
        continue;
      }
      if (gph[i] > 2.5) { killGrain(i); continue; }
      let dir = gvx[i] < 0 ? -1 : 1;
      // впереди подъём (или стенка), а сзади ниже — повернуть
      if ((dir < 0 ? hl : hr) > h && (dir < 0 ? hr : hl) < h) dir = -dir;
      // упёрлось в стенку полной колонкой — дальше некуда: растворяется
      else if ((dir < 0 ? hl : hr) > h + 100) { killGrain(i); continue; }
      const speed = Math.min(sl.max, Math.abs(gvx[i]) + sl.accel * dt);
      gvx[i] = dir * speed;
      gx[i] += gvx[i] * dt;
      const c2 = (gx[i] / cw) | 0;
      gy[i] = H - (c2 >= 0 && c2 < cols ? heap[c2] : 0);
    }

    for (let i = nd - 1; i >= 0; i--) {
      dage[i] += dt;
      if (dage[i] >= dlife[i]) { killDust(i); continue; }
      dvx[i] *= 1 - 1.6 * dt;
      dvy[i] *= 1 - 1.2 * dt;
      dx[i] += dvx[i] * dt;
      dy[i] += dvy[i] * dt;
      // пыль (с краем облачка) не заходит под текст и кнопки
      if (inText(dx[i], dy[i], dsize[i] * 0.65 + POUR.textGap)) killDust(i);
    }
  };

  // ── Отрисовка
  const render = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // куча
    if (heapSum > 0.5 && cTo >= cFrom && pattern) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      const xa = cFrom * cw;
      ctx.moveTo(xa, H);
      let top = 0;
      for (let c = Math.max(0, cFrom - 1); c <= Math.min(cols - 1, cTo + 1); c++) {
        const hs = ((c > 0 ? heap[c - 1] : heap[c]) + 2 * heap[c] + (c < cols - 1 ? heap[c + 1] : heap[c])) / 4;
        if (hs > top) top = hs;
        ctx.lineTo(c * cw + cw / 2, H - hs);
      }
      ctx.lineTo((cTo + 1) * cw, H);
      ctx.closePath();
      ctx.globalAlpha = POUR.heapAlpha;
      ctx.fillStyle = pattern;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (shade) {
        ctx.fillStyle = shade;
        ctx.fill();
      }
      stats.heapTop = top;
    } else stats.heapTop = 0;

    // зёрна — по вёдрам цвета, с привязкой к физическим пикселям
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let b = 0; b < palette.length; b++) {
      let any = false;
      for (let i = 0; i < n; i++) {
        if (gcol[i] !== b) continue;
        if (!any) { ctx.beginPath(); any = true; }
        const s = gsz[i];
        ctx.rect((gx[i] * dpr - s / 2) | 0, (gy[i] * dpr - s) | 0, s, s);
      }
      if (any) {
        ctx.fillStyle = palette[b];
        ctx.fill();
      }
    }

    // пыль
    if (nd && sprite) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < nd; i++) {
        const k = dage[i] / dlife[i];
        const s = dsize[i] * (0.6 + 0.7 * k);
        ctx.globalAlpha = dalpha[i] * Math.sin(Math.PI * k);
        ctx.drawImage(sprite, dx[i] - s / 2, dy[i] - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }

    stats.grains = n;
    stats.dust = nd;
    stats.fill = targetSum > 0 ? Math.min(1, heapSum / targetSum) : 0;
  };

  // ── Цикл и остановки
  let raf = 0;
  let last = 0;
  let paused = false;
  let onScreen = true;
  let pageVisible = document.visibilityState === 'visible';

  const frame = (now: number) => {
    raf = 0;
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    const t0 = performance.now();
    step(dt);
    render();
    const ms = performance.now() - t0;
    stats.frames++;
    stats.stepMs = ms;
    if (ms > stats.maxStepMs && stats.frames > 3) stats.maxStepMs = ms;
    schedule();
  };

  const wanted = () => laidOut && !reduced && !paused && onScreen && pageVisible;
  const schedule = () => {
    if (wanted()) {
      if (!raf) {
        if (!stats.running) last = 0;
        raf = requestAnimationFrame(frame);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    stats.running = raf !== 0;
  };

  const relayout = () => {
    layout();
    // смена ширины canvas стирает картинку — на паузе и без движения перерисовываем кадр
    if (laidOut && (reduced || paused || !onScreen || !pageVisible)) render();
    schedule();
  };

  new ResizeObserver(relayout).observe(hero);
  document.fonts?.ready.then(relayout);

  if (!reduced) {
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      schedule();
    }).observe(hero);
    document.addEventListener('visibilitychange', () => {
      pageVisible = document.visibilityState === 'visible';
      schedule();
    });
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        paused = !paused;
        toggle.setAttribute('aria-pressed', String(paused));
        schedule();
      });
    }
  }

  (canvas as HTMLCanvasElement & { pourStats?: PourStats }).pourStats = stats;
  return stats;
}
