/** Управление витриной первого экрана (без three): кнопки ‹ › и «Повернуть упаковку», ←/→ при фокусе внутри
 *  карусели, свайп/перетаскивание по сцене (горизонтальное — карусель, вертикальное — прокрутка страницы),
 *  клик/тап по соседнему мешку, лёгкая реакция витрины на курсор. Сцена может ещё грузиться — scene() вернёт null,
 *  и нажатие просто ничего не сделает. Обработчики вешаются один раз. */
import type { HeroScene } from './scene';

export interface ControlsOptions {
  region: HTMLElement;
  stage: HTMLElement;
  prev: HTMLButtonElement | null;
  next: HTMLButtonElement | null;
  rotate: HTMLButtonElement | null;
  reduced: boolean;
  scene: () => HeroScene | null;
}

export function bindControls({ region, stage, prev, next, rotate, reduced, scene }: ControlsOptions) {
  prev?.addEventListener('click', () => scene()?.next(-1));
  next?.addEventListener('click', () => scene()?.next(1));
  rotate?.addEventListener('click', () => scene()?.spin());
  region.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    scene()?.next(e.key === 'ArrowLeft' ? -1 : 1);
  });

  // Свайп / перетаскивание по сцене: горизонтальное — карусель, вертикальное — прокрутка страницы
  // (touch-action: pan-y — браузер сам прокручивает и присылает pointercancel). Короткое касание — выбор мешка.
  let gesture: { id: number; x: number; y: number; drag: boolean; lx: number; lt: number; vx: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    if (!scene() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false, lx: e.clientX, lt: e.timeStamp, vx: 0 };
  });
  stage.addEventListener('pointermove', (e) => {
    // мышь без нажатой кнопки — жест закончился где-то вне сцены (отпустили за её пределами): сбросить
    if (gesture && e.pointerId === gesture.id && e.pointerType === 'mouse' && e.buttons === 0) endGesture(e, true);
    if (gesture && e.pointerId === gesture.id) {
      const dx = e.clientX - gesture.x;
      const dy = e.clientY - gesture.y;
      if (!gesture.drag && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        gesture.drag = true;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('is-dragging');
        scene()?.dragStart();
      }
      if (gesture.drag) {
        const dt = Math.max(1, e.timeStamp - gesture.lt);
        gesture.vx = gesture.vx * 0.6 + ((e.clientX - gesture.lx) / dt) * 1000 * 0.4;
        gesture.lx = e.clientX;
        gesture.lt = e.timeStamp;
        scene()?.dragMove(dx);
      }
      return;
    }
    if (e.pointerType === 'mouse') hover(e.clientX, e.clientY);
  });
  function endGesture(e: PointerEvent, cancel: boolean) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture;
    gesture = null;
    stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    if (g.drag) {
      scene()?.dragEnd(cancel ? 0 : e.clientX - g.x, cancel ? 0 : g.vx);
      return;
    }
    // короткое касание/клик — выбор мешка, только если отпустили на сцене
    const sc = scene();
    if (cancel || !sc || !stage.contains(e.target as Node)) return;
    const i = sc.pickAt(e.clientX, e.clientY);
    if (i >= 0) sc.goTo(i);
  }
  // отпускание и отмену слушаем на window: кнопку мыши могут отпустить за пределами сцены
  window.addEventListener('pointerup', (e) => endGesture(e, false));
  window.addEventListener('pointercancel', (e) => endGesture(e, true));

  // Курсор: лёгкий поворот витрины и «рука» над соседним мешком (только мышь)
  let hoverRaf = 0;
  let hx = 0;
  let hy = 0;
  const hover = (x: number, y: number) => {
    hx = x;
    hy = y;
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      const sc = scene();
      if (!sc) return;
      const r = stage.getBoundingClientRect();
      if (!reduced) sc.setPointer(((hx - r.left) / r.width) * 2 - 1, ((hy - r.top) / r.height) * 2 - 1);
      const i = sc.pickAt(hx, hy);
      // «рука» — только над соседом: клик по активному ничего не делает
      stage.classList.toggle('is-pick', i >= 0 && i !== sc.active);
    });
  };
  stage.addEventListener('pointerleave', () => {
    scene()?.setPointer(0, 0);
    stage.classList.remove('is-pick');
  });
}
