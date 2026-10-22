/** Какие смеси стоят на витрине первого экрана главной (src/components/content/HeroScene.astro).
 *
 *  По умолчанию набор собирается сам — та же логика, что была у сетки упаковок первого экрана:
 *  по очереди из разных брендов и разделов, только позиции с фото упаковки не меньше `minImagePx`.
 *  Чтобы поставить свои позиции — впишите их `id` из src/data/positions.json в `ids` (порядок = порядок
 *  на витрине, первая — активная при входе). Неизвестные id и позиции без фото пропускаются.
 *  Тексты на витрине — только из данных позиции: `title` и `purpose` (обрезка по словам, сам текст не меняется). */
import type { Position } from './types';
import { brandsIn } from './positions';

export const SHOWCASE = {
  /** свой набор позиций (id). Пусто — набор собирается автоматически */
  ids: [] as string[],
  /** сколько мешков на витрине при автоматическом наборе (по брифу 6–8) */
  count: 7,
  /** фото упаковки не меньше этого по длинной стороне, px (маленький исходник не растягиваем) */
  minImagePx: 300,
  /** описание под названием — до стольких символов, обрезка по словам с «…» */
  descMax: 140,
};

/** Набор витрины. Без своего списка — по кругу из брендов, в каждом круге — раздел, которого ещё нет. */
export function pickShowcase(all: Position[]): Position[] {
  const ok = (p: Position | undefined): p is Position => Boolean(p?.image && Math.max(p.imageW ?? 0, p.imageH ?? 0) >= SHOWCASE.minImagePx);
  if (SHOWCASE.ids.length) {
    const byId = new Map(all.map((p) => [p.id, p]));
    const chosen = SHOWCASE.ids.map((id) => byId.get(id)).filter(ok);
    if (chosen.length) return chosen;
  }
  const pool = all.filter(ok);
  const brands = brandsIn(all);
  const out: Position[] = [];
  const usedSections = new Set<string>();
  for (let round = 0; out.length < SHOWCASE.count && round < 4; round++) {
    for (const b of brands) {
      const free = pool.filter((p) => p.brand === b && !out.includes(p));
      const pick = free.find((p) => !usedSections.has(p.section)) ?? (round > 0 ? free[0] : undefined);
      if (pick && out.length < SHOWCASE.count) { out.push(pick); usedSections.add(pick.section); }
    }
  }
  return out;
}

/** Обрезка по словам: не длиннее max символов, на конце «…» (если текст длиннее). Знаки препинания у обрезки снимаются. */
export function shortText(text: string, max = SHOWCASE.descMax): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.—–-]+$/, '')}…`;
}
