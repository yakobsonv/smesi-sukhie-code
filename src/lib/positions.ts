/** Доступ к позициям каталога (src/data/positions.json — собирается скриптом
 *  scripts/build_positions.py из разбора карточек производителей и каталога tk-sm.ru). */
import data from '../data/positions.json';
import type { Position } from './types';
import { SECTIONS } from '../data/sections';

export const POSITIONS = data as Position[];

export function inSection(slug: string): Position[] {
  return POSITIONS.filter((p) => p.section === slug);
}

export function inPart(slug: string, part: string): Position[] {
  return POSITIONS.filter((p) => p.section === slug && p.part === part);
}

const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

/** Самая низкая цена среди вариантов магазина (строка — ровно как в магазине). */
export function minPrice(p: Position) {
  const priced = p.offers.filter((o) => o.price && !Number.isNaN(num(o.price)));
  if (!priced.length) return null;
  return priced.reduce((a, b) => (num(b.price) < num(a.price) ? b : a));
}

/** Три факта для строки таблицы — дословно; что есть у производителя. */
export function factsOf(p: Position) {
  const out: { label: string; value: string }[] = [];
  const clean = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();
  const norm = (s: string) => clean(s).toLowerCase().replace(/[.:;]$/, '');
  // если то же значение есть в характеристиках — берём подпись производителя («Расход сухой смеси на 1 м³ раствора»)
  const labelOf = (value: string, fallback: string) => p.specs.find((s) => norm(s.value) === norm(value))?.name ?? fallback;
  if (p.layer) out.push({ label: labelOf(p.layer, 'Слой/шов'), value: clean(p.layer) });
  if (p.consumption) out.push({ label: labelOf(p.consumption, 'Расход'), value: clean(p.consumption) });
  if (p.packaging) out.push({ label: 'Упаковка', value: clean(p.packaging) });
  return out.slice(0, 3);
}

export function brandsIn(items: Position[]): string[] {
  const order = ['Perel', 'Dauer', 'Основит', 'Стройбриг', 'Promix', 'BauMax'];
  return [...new Set(items.map((p) => p.brand))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function sectionCount(slug: string): number {
  return inSection(slug).length;
}

export function totalCount(): number {
  return POSITIONS.filter((p) => SECTIONS.some((s) => s.slug === p.section)).length;
}

/** Склонение: 1 позиция, 2 позиции, 5 позиций. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
