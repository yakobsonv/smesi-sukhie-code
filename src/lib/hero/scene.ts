/** Сцена первого экрана: один WebGLRenderer на один canvas во весь первый экран, один цикл rAF и единый
 *  таймлайн «облако → заголовок → витрина → покой». Модуль (вместе с three) грузится динамическим import()
 *  из hero-entry.ts уже после первой отрисовки страницы — текст и кнопки его не ждут.
 *
 *  Режимы:
 *   intro  — полное интро (первый вход во вкладку): частицы + выход мешков, фазы сообщаются в onPhase;
 *   enter  — повторный вход: частиц нет, мешки за HERO.time.returnRise выходят из глубины;
 *   still  — prefers-reduced-motion: мешки сразу на местах, без парения; кадр рисуется только по запросу.
 *  Цикл крутится, только когда первый экран на экране, вкладка видна и есть что анимировать; время интро
 *  копится по кадрам (шаг ≤ 1/30 с) — в скрытой вкладке интро стоит, а не проматывается. */
import { NoToneMapping, OrthographicCamera, SRGBColorSpace, Scene, WebGLRenderer } from 'three';
import { HERO } from '../hero-config';
import { TitleParticles } from './particles';
import { Showcase, type ShowItem } from './showcase';
import { sampleTitle } from './title-sample';

export type Phase = 'cloud' | 'title' | 'reveal' | 'show' | 'done';
export type Mode = 'intro' | 'enter' | 'still';

export interface SceneOptions {
  hero: HTMLElement;
  canvas: HTMLCanvasElement;
  h1: HTMLElement;
  stage: HTMLElement;
  items: ShowItem[];
  mode: Mode;
  onPhase: (p: Phase) => void;
  onActive: (i: number) => void;
}

export interface HeroScene {
  readonly mode: Mode;
  readonly playing: boolean;
  /** индекс активного мешка */
  readonly active: number;
  skip(): void;
  replay(): void;
  next(d: number): void;
  goTo(i: number): void;
  spin(): void;
  dragStart(): void;
  dragMove(dx: number): void;
  dragEnd(dx: number, vx: number): void;
  /** клиентские координаты → индекс мешка под ними или −1 */
  pickAt(clientX: number, clientY: number): number;
  setPointer(x: number, y: number): void;
  setRunning(onScreen: boolean, visible: boolean): void;
  /** было взаимодействие (указатель, прокрутка, фокус) — продолжить рендер после остановки в покое */
  wake(): void;
  relayout(): void;
  stats(): Record<string, unknown>;
  dispose(): void;
}

const T = HERO.time;
const PHASES: [Phase, number][] = [
  ['title', T.titleStart],
  ['reveal', T.h1Reveal],
  ['show', T.infoAt],
  ['done', T.end],
];
const easeOut = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

export function createScene(o: SceneOptions): HeroScene | null {
  let renderer: WebGLRenderer;
  try {
    // сглаживание — только с мышью (ПК); на сенсорных экранах высокая плотность пикселей и так скрывает «лесенку»
    const fine = window.matchMedia('(pointer: fine)').matches;
    renderer = new WebGLRenderer({ canvas: o.canvas, antialias: fine, alpha: false, powerPreference: 'default' });
  } catch {
    return null;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(HERO.render.background, 1);
  renderer.info.autoReset = false; // считаем вызовы отрисовки за кадр целиком (витрина + частицы)

  let mode: Mode = o.mode;
  // время интро/входа — реальное, от старта (не копится по кадрам): на 10 fps интро всё равно укладывается в 5 с,
  // пропуская кадры; скрытая вкладка останавливает цикл, а по возвращении интро уже закончено
  let t0 = performance.now();
  let time = 0;
  let clock = 0; // время для парения, с (копится по кадрам — после паузы мешки не прыгают)
  let deadlineTimer = 0;
  let lastActivity = performance.now();
  let lastRender = 0;
  let phaseIdx = mode === 'intro' ? 0 : PHASES.length;
  let particles: TitleParticles | null = null;
  const pScene = new Scene();
  const pCam = new OrthographicCamera(0, 1, 1, 0, -1, 1);
  let mobile = false;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let onScreen = true;
  let visible = document.visibilityState === 'visible';
  let raf = 0;
  let last = 0;
  let dirty = true;
  let frames = 0;
  let leaveFrom = 0; // «Повторить»: мешки уходят в глубину из этого состояния
  let leaveAt = -1;

  const show = new Showcase(o.items, {
    reduced: mode === 'still',
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
    onActive: o.onActive,
    onLoaded: () => { dirty = true; schedule(); },
  });

  const touch = () => {
    lastActivity = performance.now();
    dirty = true;
    schedule();
  };

  const isMobile = () => W < HERO.mobileBelow || window.matchMedia('(pointer: coarse)').matches;

  const measure = () => {
    const box = o.hero.getBoundingClientRect();
    W = o.hero.clientWidth;
    H = o.hero.clientHeight;
    mobile = isMobile();
    dpr = Math.min(window.devicePixelRatio || 1, mobile ? HERO.render.maxDprMobile : HERO.render.maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    const s = o.stage.getBoundingClientRect();
    show.setStage({ left: s.left - box.left, top: s.top - box.top, width: Math.max(1, s.width), height: Math.max(1, s.height) }, W, H, W < HERO.mobileBelow);
    if (particles) particles.setLayout(particleLayout(box));
    dirty = true;
  };

  const particleMode = () => (mobile ? HERO.particles.mobile : HERO.particles.desktop);

  /** раскладка для частиц; на телефоне — свободная полоса первого экрана под кнопками героя и «Пропустить» */
  function particleLayout(box: DOMRect) {
    let freeTop: number | undefined;
    let visibleBottom: number | undefined;
    if (W < HERO.mobileBelow) {
      const bottoms = [o.hero.querySelector('.hero__actions'), o.hero.querySelector('[data-hero-intro]')]
        .filter((el): el is Element => Boolean(el?.getClientRects().length))
        .map((el) => el.getBoundingClientRect().bottom - box.top);
      freeTop = Math.max(0, ...bottoms) + 12;
      visibleBottom = Math.min(H, window.innerHeight - box.top);
    }
    return { width: W, height: H, dpr, title: sampleTitle(o.h1, box, particleMode().sampleStep), freeTop, visibleBottom };
  }

  const buildParticles = () => {
    particles?.dispose();
    particles = new TitleParticles(particleMode(), particleLayout(o.hero.getBoundingClientRect()));
    pScene.add(particles.points);
  };

  const dropParticles = () => {
    particles?.dispose();
    particles = null;
  };

  /** насколько вышел из глубины мешок с порядком order */
  const emerge = (order: number) => {
    let e = 1;
    if (mode === 'intro' && phaseIdx < PHASES.length) e = easeOut((time - T.showStart - order * T.bagStagger) / T.bagRise);
    else if (mode === 'enter') e = easeOut((time - order * 0.06) / T.returnRise);
    if (leaveAt >= 0) e = Math.max(e, leaveFrom * (1 - easeOut((time - leaveAt) / 0.4)));
    return e;
  };

  const advancePhases = () => {
    while (mode === 'intro' && phaseIdx < PHASES.length && time >= PHASES[phaseIdx][1]) {
      const p = PHASES[phaseIdx][0];
      phaseIdx++;
      if (p === 'done') dropParticles();
      o.onPhase(p);
    }
  };

  /** что-то движется не «само по себе»: интро, вход, уход при «Повторить», карусель, жест, поворот, смена ореола */
  const busy = () =>
    (mode === 'intro' && phaseIdx < PHASES.length) || (mode === 'enter' && time < T.returnRise + 0.6) || leaveAt >= 0 || show.busy();
  const animating = () => {
    if (mode === 'still') return false;
    // парение в покое — пока было взаимодействие за последние idleStop секунд
    return busy() || performance.now() - lastActivity < HERO.render.idleStop * 1000;
  };

  const render = () => {
    renderer.info.reset();
    renderer.render(show.scene, show.camera);
    if (particles) {
      renderer.autoClear = false;
      renderer.render(pScene, pCam);
      renderer.autoClear = true;
    }
  };

  const frame = (now: number) => {
    raf = 0;
    // покой: не чаще idleFps (rAF продолжает идти, но кадр не рисуется)
    if (!busy() && !dirty && now - lastRender < 1000 / HERO.render.idleFps - 4) {
      schedule();
      return;
    }
    const dt = last ? Math.min((now - last) / 1000, 1 / 15) : 1 / 60;
    last = now;
    lastRender = now;
    time = (performance.now() - t0) / 1000;
    clock += dt;
    if (leaveAt >= 0 && time - leaveAt > 0.4) leaveAt = -1;
    if (mode === 'intro') {
      particles?.setTime(time);
      advancePhases();
    }
    show.update(dt, clock, emerge);
    render();
    frames++;
    dirty = false;
    schedule();
  };

  const schedule = () => {
    const want = onScreen && visible && (animating() || dirty);
    if (want && !raf) {
      if (!last || performance.now() - last > 100) last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!want && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  /** жёсткий предел интро по реальному времени (таймер, а не кадры — сработает и при 1–5 fps) */
  function armDeadline() {
    window.clearTimeout(deadlineTimer);
    deadlineTimer = window.setTimeout(() => api.skip(), T.deadline * 1000);
  }

  measure();
  if (mode === 'intro') {
    o.onPhase('cloud');
    buildParticles();
    armDeadline();
  }
  schedule();

  const api: HeroScene = {
    get mode() { return mode; },
    get playing() { return mode === 'intro' && phaseIdx < PHASES.length; },
    get active() { return show.active; },
    skip() {
      window.clearTimeout(deadlineTimer);
      if (mode !== 'intro' || phaseIdx >= PHASES.length) return;
      t0 = Math.min(t0, performance.now() - T.end * 1000);
      time = Math.max(time, T.end);
      advancePhases();
      leaveAt = -1;
      dirty = true;
      schedule();
    },
    replay() {
      if (mode === 'still') return;
      leaveFrom = emerge(0);
      mode = 'intro';
      t0 = performance.now();
      time = 0;
      leaveAt = 0;
      phaseIdx = 0;
      lastActivity = t0;
      o.onPhase('cloud'); // сначала DOM («Пропустить» на своём месте) — потом замер свободного места под облако
      buildParticles();
      armDeadline();
      dirty = true;
      schedule();
    },
    next(d) { show.next(d); touch(); },
    goTo(i) { show.goTo(i); touch(); },
    spin() { show.spin(); touch(); },
    dragStart() { show.dragStart(); touch(); },
    dragMove(dx) { show.dragMove(dx); touch(); },
    dragEnd(dx, vx) { show.dragEnd(dx, vx); touch(); },
    pickAt(cx, cy) {
      const r = o.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return -1;
      return show.pick(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    },
    setPointer(x, y) { show.setPointer(x, y); lastActivity = performance.now(); schedule(); },
    setRunning(s, v) { onScreen = s; visible = v; schedule(); },
    wake() { lastActivity = performance.now(); schedule(); },
    relayout() { measure(); schedule(); },
    stats() {
      return {
        mode, time: +time.toFixed(2), phase: mode !== 'intro' ? mode : phaseIdx === 0 ? 'cloud' : PHASES[phaseIdx - 1][0], frames, running: raf !== 0,
        particles: particles ? particleMode().count : 0, dpr, mobile, calls: renderer.info.render.calls, W, H,
        active: show.active, busy: busy(), idleFor: +((performance.now() - lastActivity) / 1000).toFixed(1),
      };
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.clearTimeout(deadlineTimer);
      dropParticles();
      show.dispose();
      renderer.dispose();
      // контекст уже потерян (сбой драйвера) — повторная потеря дала бы предупреждение в консоли
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    },
  };
  return api;
}
