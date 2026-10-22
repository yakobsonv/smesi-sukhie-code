/** Первый экран главной — управление страницей (без three): фазы интро на DOM, кнопки, клавиши, свайп,
 *  остановка вне экрана и в скрытой вкладке, sessionStorage, запасной статичный экран.
 *  Сама сцена (three, частицы, витрина) — src/lib/hero/scene.ts, грузится динамическим import() после первой
 *  отрисовки. Решение «играть интро / готовая композиция / без WebGL» принимает ещё до отрисовки маленький
 *  inline-скрипт в HeroScene.astro (атрибуты data-gl и data-intro, классы is-h1-hidden / is-info-hidden).
 *  Обработчики вешаются один раз на страницу; «Повторить» и resize переиспользуют ту же сцену. */
import { HERO } from '../hero-config';
import type { HeroScene, Mode, Phase } from './scene';
import type { ShowItem } from './showcase';
import { bindControls } from './controls';

const LABEL_SKIP = 'Пропустить анимацию';
const LABEL_REPLAY = 'Повторить анимацию';

export function initHero(hero: HTMLElement) {
  const $ = <T extends Element>(sel: string) => hero.querySelector<T>(sel);
  let canvas = $<HTMLCanvasElement>('[data-hero-gl]');
  const h1 = $<HTMLElement>('h1');
  const stage = $<HTMLElement>('[data-hero-stage]');
  const region = $<HTMLElement>('[data-hero-show]');
  const name = $<HTMLElement>('[data-hero-name]');
  const desc = $<HTMLElement>('[data-hero-desc]');
  const more = $<HTMLAnchorElement>('[data-hero-more]');
  const info = $<HTMLElement>('[data-hero-info]');
  const counter = $<HTMLElement>('[data-hero-index]');
  const introBtn = $<HTMLButtonElement>('[data-hero-intro]');
  const introLabel = introBtn?.querySelector<HTMLElement>('[data-label]') ?? introBtn;
  let items: ShowItem[] = [];
  try { items = JSON.parse($('[data-hero-items]')?.textContent || '[]'); } catch { /* пусто — запасной экран */ }

  const reveal = () => hero.classList.remove('is-h1-hidden', 'is-info-hidden');
  const fallback = () => {
    hero.dataset.gl = '0';
    reveal();
  };
  if (hero.dataset.gl !== '1' || !canvas || !h1 || !stage || !region || !items.length) { fallback(); return; }
  let used = false; // контекст этого canvas уже отдан (и потерян при dispose) — для новой сцены нужен новый canvas

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let intro = hero.dataset.intro === 'play';
  let scene: HeroScene | null = null;
  let booting = false;
  let onScreen = true;
  let pageVisible = document.visibilityState === 'visible';

  const setIntroLabel = (playing: boolean) => {
    if (!introBtn || !introLabel) return;
    introLabel.textContent = playing ? LABEL_SKIP : LABEL_REPLAY;
    introBtn.dataset.state = playing ? 'skip' : 'replay';
  };
  if (introBtn) {
    introBtn.hidden = reduced;
    setIntroLabel(intro);
  }

  // Интро не может держать заголовок скрытым дольше startTimeout, если сцена ещё не загрузилась
  const late = window.setTimeout(() => {
    if (scene || !intro) return;
    intro = false;
    hero.dataset.intro = 'done';
    reveal();
    setIntroLabel(false);
  }, HERO.startTimeout * 1000);

  // ── Фазы интро → DOM (только смена классов; кадры DOM не трогают)
  let fastTimer = 0;
  const onPhase = (p: Phase) => {
    hero.dataset.phase = p;
    if (p === 'cloud') {
      hero.classList.add('is-h1-hidden', 'is-info-hidden');
      setIntroLabel(true);
    } else if (p === 'reveal') hero.classList.remove('is-h1-hidden');
    else if (p === 'show') hero.classList.remove('is-info-hidden');
    else if (p === 'done') {
      hero.dataset.intro = 'done';
      setIntroLabel(false);
    }
  };

  // ── Подпись активной смеси: короткое растворение, последний выбор побеждает
  let swapTimer = 0;
  let shown = 0;
  const onActive = (i: number) => {
    const it = items[i];
    if (!it || i === shown) return;
    shown = i;
    const apply = () => {
      if (name) name.textContent = it.title;
      if (counter) counter.textContent = String(i + 1);
      if (desc) desc.textContent = it.desc;
      if (more) {
        more.href = it.href;
        more.setAttribute('aria-label', `Подробнее: ${it.title}`);
      }
      info?.classList.remove('is-swapping');
    };
    window.clearTimeout(swapTimer);
    if (reduced || hero.classList.contains('is-info-hidden')) { apply(); return; }
    info?.classList.add('is-swapping');
    swapTimer = window.setTimeout(apply, 160);
  };

  const boot = async (mode: Mode) => {
    if (scene || booting) return;
    booting = true;
    try {
      const font = (() => {
        const cs = getComputedStyle(h1);
        return `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      })();
      const [mod] = await Promise.all([import('./scene'), document.fonts?.load(font).catch(() => null)]);
      if (mode === 'intro' && !intro) mode = 'enter'; // опоздали — без интро
      if (used) {
        const fresh = canvas!.cloneNode() as HTMLCanvasElement;
        canvas!.replaceWith(fresh);
        canvas = fresh;
        canvas.addEventListener('webglcontextlost', onLost);
      }
      used = true;
      scene = mod.createScene({ hero, canvas: canvas!, h1, stage, items, mode, onPhase, onActive });
    } catch {
      scene = null;
    }
    booting = false;
    window.clearTimeout(late);
    if (!scene) { fallback(); return; }
    if (scene.mode === 'intro') {
      try { sessionStorage.setItem(HERO.storageKey, '1'); } catch { /* приватный режим — интро может повториться */ }
    } else {
      reveal();
      setIntroLabel(false);
    }
    scene.setRunning(onScreen, pageVisible);
    (hero as HTMLElement & { heroStats?: () => unknown }).heroStats = () => scene?.stats();
  };


  // ── Управление витриной: стрелки, «Повернуть», клавиши, свайп, клик по мешку, курсор — controls.ts
  bindControls({ region, stage, reduced, scene: () => scene, prev: $('[data-hero-prev]'), next: $('[data-hero-next]'), rotate: $('[data-hero-rotate]') });

  introBtn?.addEventListener('click', () => {
    if (introBtn.dataset.state === 'skip') {
      hero.classList.add('is-fast');
      window.clearTimeout(fastTimer);
      fastTimer = window.setTimeout(() => hero.classList.remove('is-fast'), 400);
      if (scene) scene.skip();
      else {
        intro = false;
        hero.dataset.intro = 'done';
        reveal();
        setIntroLabel(false);
      }
    } else if (scene) {
      intro = true;
      scene.replay();
    }
  });

  // ── Остановка вне экрана и в скрытой вкладке; уход с экрана во время интро = «пропустить»
  new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    if (!onScreen && scene?.playing) scene.skip();
    scene?.setRunning(onScreen, pageVisible);
  }).observe(hero);
  document.addEventListener('visibilitychange', () => {
    pageVisible = document.visibilityState === 'visible';
    scene?.setRunning(onScreen, pageVisible);
  });

  // ── Размеры: пересчёт камеры, stage и точек букв (не чаще кадра)
  let resizeRaf = 0;
  new ResizeObserver(() => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      scene?.relayout();
    });
  }).observe(hero);

  // ── Потеря WebGL-контекста (сбой драйвера, нехватка памяти) — статичный экран вместо пустой сцены
  let disposing = false;
  const drop = () => {
    disposing = true;
    scene?.dispose();
    scene = null;
    disposing = false;
  };
  function onLost() {
    if (disposing || !scene) return; // свой dispose() тоже теряет контекст — это не сбой
    drop();
    fallback();
  }
  canvas.addEventListener('webglcontextlost', onLost);

  // ── Уход со страницы: ресурсы WebGL освобождаются; возврат кнопкой «назад» (bfcache) — готовая композиция
  window.addEventListener('pagehide', drop);
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && !scene) {
      intro = false;
      boot(reduced ? 'still' : 'enter');
    }
  });

  // после первой отрисовки
  requestAnimationFrame(() => {
    window.setTimeout(() => boot(reduced ? 'still' : intro ? 'intro' : 'enter'), 0);
  });
}
