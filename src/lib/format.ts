/** Мелкие помощники вывода. Правило одно: цену не трогаем.
 *  Пришла строка «32,40» — так и печатаем, никаких округлений и пересчётов. */

import type { Price } from './types';

/** Цена для показа человеку. Строка отдаётся как есть, число — в русском формате. */
export function formatPrice(value: string | number): string {
  if (typeof value === 'string') return value.trim();
  const fractional = !Number.isInteger(value);
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Цена для микроразметки: «32,40» → «32.40» (schema.org требует точку и без пробелов). */
export function priceToSchema(value: string | number): string {
  if (typeof value === 'number') return String(value);
  return value.replace(/\s| /g, '').replace(',', '.');
}

/** Число из цены — для min/max в AggregateOffer. NaN, если разобрать нельзя. */
export function priceToNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(priceToSchema(value));
}

/** Полная подпись цены: «от 32,40 ₽» */
export function priceLabel(price: Price): string {
  const parts = [price.prefix, formatPrice(price.value), price.currency ?? '₽'];
  return parts.filter(Boolean).join(' ');
}

/** tel: из показанного номера — «+7 (495) 669-32-00» → «tel:+74956693200» */
export function telHref(display: string): string {
  const digits = display.replace(/[^\d+]/g, '');
  return `tel:${digits.startsWith('+') ? digits : '+' + digits}`;
}

/** Собрать классы: cx('card', active && 'card--active') */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Безопасный id из произвольной строки — для якорей и связки label/input. */
export function toId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'id';
}

/** Первые N элементов; N не задан — вернуть всё. */
export function limit<T>(items: T[], n?: number): T[] {
  return typeof n === 'number' && n > 0 ? items.slice(0, n) : items;
}

/** Мягкие переносы в длинных словах.
 *
 *  Зачем: на телефоне карточки каталога идут в два столбца, строка внутри карточки — 135 px.
 *  Слова вроде «старооскольский» (197 px) в неё не влезают, и браузер по overflow-wrap
 *  рвёт их где придётся: «старооскол / ьский», «облицовоч / ный». Читается плохо.
 *  Здесь слово получает мягкие переносы (U+00AD) по слогам — перенос виден как обычный
 *  дефис и стоит на своём месте. Список — только те слова, что реально не помещаются
 *  (замер по всем 55 страницам копии); всё остальное переносится целиком, как и раньше.
 *
 *  Размеры («200х100х80») переносим без дефиса, разрешая разрыв после «х» (U+200B):
 *  дефис в размере читался бы как часть числа.
 */
const SHY = '­';
const ZWSP = '​';

/** позиции, ПОСЛЕ которых можно перенести; ключ — слово в нижнем регистре */
const SYLLABLES: Record<string, number[]> = {
  старооскольский: [5, 11],
  старооскольского: [5, 11],
  облицовочный: [4, 6, 9],
  облицовочная: [4, 6, 9],
  облицовочного: [4, 6, 9],
  соломенный: [4, 7],
  коричневый: [5, 7],
  коричневая: [5, 7],
  коричневого: [5, 7],
  персиковый: [3, 5, 7],
  полнотелый: [5, 7],
  тротуарная: [3, 5, 7],
  тротуарной: [3, 5, 7],
  фактурный: [3, 6],
  железногорский: [7, 10],
  железногорского: [7, 10],
};

export function softWrap(text: string): string {
  if (!text) return text;
  return text.replace(/[^\s]+/g, (word) => {
    // размеры вида 200х100х80 — разрыв после «х», без дефиса
    if (/^\d+[хx]\d+([хx]\d+)?$/i.test(word)) return word.replace(/([хx])(?=\d)/gi, `$1${ZWSP}`);
    const key = word.toLowerCase().replace(/[^а-яёa-z]/gi, '');
    const cuts = SYLLABLES[key];
    if (!cuts) return word;
    // смещение: слово могло начинаться со знака препинания
    const start = word.toLowerCase().indexOf(key[0]);
    let out = '';
    let prev = 0;
    for (const cut of cuts) {
      const at = start + cut;
      out += word.slice(prev, at) + SHY;
      prev = at;
    }
    return out + word.slice(prev);
  });
}

/** Русское склонение слова после числа: 1 позиция, 2 позиции, 5 позиций.
 *  Возвращает ТОЛЬКО слово — число подставляет вызывающий код.
 *  Была своя копия в ЖКЗ; вынесена сюда, когда на семи страницах Оскола нашлось
 *  захардкоженное «98 позиции». */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = mod100 % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
