/** Блокировка прокрутки страницы под открытым меню и окном характеристик.
 *  Причина держателя (owner): меню и окно блокируют независимо — прокрутка
 *  возвращается, только когда отпустили оба.
 *
 *  Как работает: класс на <html> (стиль — base.css, «БЛОКИРОВКА ПРОКРУТКИ»):
 *  overflow: hidden у корня, позиция прокрутки при этом не сбрасывается.
 *  Ширину пропавшей полосы прокрутки (на ПК) возвращаем отступом через
 *  --scrollbar-gap, чтобы страница не дёргалась вбок. */

const owners = new Set<string>();
const CLS = 'is-scroll-locked';

export function lockScroll(owner: string) {
  const root = document.documentElement;
  if (owners.size === 0) {
    const gap = window.innerWidth - root.clientWidth;
    root.style.setProperty('--scrollbar-gap', `${Math.max(gap, 0)}px`);
    root.classList.add(CLS);
  }
  owners.add(owner);
}

export function unlockScroll(owner: string) {
  if (!owners.delete(owner) || owners.size > 0) return;
  const root = document.documentElement;
  root.classList.remove(CLS);
  root.style.removeProperty('--scrollbar-gap');
}
