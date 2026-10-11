/** Реестр сайта «Сухие строительные смеси» — сайт один.
 *
 *  Новый сайт дилера (ООО «Кирпичный трест», Москва и МО) о сухих строительных смесях
 *  Perel, Dauer и Основит. План страниц — vault «Сухие смеси — разведка ассортимента и план
 *  страниц (09.10.2026)», «да» Влада 11.10. Механика (компоненты, правовые страницы,
 *  проверки) — из репозитория recke-code.
 *
 *  ⚠️ Боевого домена ПОКА НЕТ (Влад 11.10: «выкладывай так же на веркель»). Пока его нет,
 *  canonical ведёт на адрес превью, на всех страницах noindex, в vercel.json — X-Robots-Tag,
 *  в robots.txt — Disallow. Когда домен появится — заполнить domain/punycode/origin
 *  и снять hasLiveDomain.
 */

import type { SiteConfig, SiteKey } from './types';

export const SITE_KEYS: SiteKey[] = ['sukhie'];

/** Адрес превью этого репозитория. */
export const PREVIEW_ORIGIN = 'https://smesi-sukhie-code.vercel.app';

/** Продавец. Реквизиты — из «Положения» и «Согласия» самого клиента (src/data/legal.ts).
 *  ⚠️ Телефон: Влад 11.10 — «пришлю позже». До его ответа стоит номер действующего магазина
 *  смесей клиента tk-sm.ru («ТОРГКОМПЛЕКТ», страница «Контактная информация», снято 11.10.2026):
 *  Научный проезд, 10 (м. Калужская) +7 (495) 505-50-68 — он же записан у «Кирпичного треста»
 *  на карте дилеров dauer.ru. Второй офис — Большая Почтовая, 55/59, +7 (495) 669-40-64. */
const SELLER = {
  phone: { display: '+7 (495) 505-50-68', href: 'tel:+74955055068' },
  phonesExtra: [{ display: '+7 (495) 669-40-64', href: 'tel:+74956694064' }],
  hours: 'Пн–Пт: 9:00–18:00',
  legal: { name: 'ООО «Кирпичный трест»', inn: '7727756057', ogrn: '1117746587727', postalCode: '117246' },
  address: { street: 'Научный проезд, 10', locality: 'Москва', country: 'RU' },
  geo: { lat: 55.656402, lng: 37.553388 },
  sameAs: [] as string[],
};

/** Офисы продаж — со страницы контактов tk-sm.ru (адреса, метро, телефоны). */
export const OFFICES = [
  {
    name: 'Офис продаж на Научном проезде',
    address: 'Москва, Научный проезд, 10',
    metro: 'м. Калужская',
    phone: { display: '+7 (495) 505-50-68', href: 'tel:+74955055068' },
  },
  {
    name: 'Офис продаж на Большой Почтовой',
    address: 'Москва, ул. Большая Почтовая, 55/59',
    metro: 'м. Электрозаводская',
    phone: { display: '+7 (495) 669-40-64', href: 'tel:+74956694064' },
  },
] as const;

export const SITES: Record<SiteKey, SiteConfig> = {
  sukhie: {
    key: 'sukhie',
    brand: 'Кирпичный трест',
    domain: '',
    punycode: '',
    origin: '',
    hasLiveDomain: false,
    base: '',
    ...SELLER,
    orgDescription:
      'Сухие строительные смеси Основит, Perel, Стройбриг, Promix и Dauer: кладочные растворы, клей для блоков, штукатурки, шпаклёвки, плиточный клей, смеси для пола, фасада и брусчатки — продажа в Москве и Московской области.',
    // «Дилер» не пишем: Влад 11.10 — статус у производителей не подтверждаем.
    legalLine: '© {year} ООО «Кирпичный трест», ИНН 7727756057. Названия смесей и торговые марки принадлежат их производителям.',
    metrikaId: '',
    logo: { text: 'Кирпичный трест', sub: 'сухие строительные смеси', alt: 'Кирпичный трест — сухие строительные смеси' },
  },
};

export function getSite(key: SiteKey): SiteConfig {
  const site = SITES[key];
  if (!site) throw new Error(`Неизвестный сайт: ${key}`);
  return site;
}

/** Локальный путь страницы: ('sukhie', 'plitochnyj-klej') → '/plitochnyj-klej/'. */
export function localPath(key: SiteKey, slug = ''): string {
  const base = getSite(key).base;
  const clean = slug.replace(/^\/+|\/+$/g, '');
  return clean ? `${base}/${clean}/` : `${base}/`;
}

/** Адрес страницы для canonical и og:url. Домена нет — ведём на превью.
 *  Со слэшем на конце в обоих случаях: в vercel.json стоит trailingSlash. */
export function liveUrl(key: SiteKey, slug = ''): string {
  const site = getSite(key);
  const clean = slug.replace(/^\/+|\/+$/g, '');
  const root = site.hasLiveDomain === false ? `${PREVIEW_ORIGIN}${site.base}` : site.origin;
  return clean ? `${root}/${clean}/` : `${root}/`;
}
