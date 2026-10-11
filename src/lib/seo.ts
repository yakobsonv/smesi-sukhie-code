/** Сборка микроразметки и адресов.
 *  Принцип: JSON-LD строится из тех же данных, что и видимый текст.
 *  Цену в схему руками не пишем — она приходит из данных страницы. */

import type { BreadcrumbItem, FaqItem, Price, SiteConfig, SiteKey } from './types';
import { getSite, liveUrl, localPath } from './sites';
import { priceToNumber, priceToSchema } from './format';

export { liveUrl, localPath, getSite };

/** canonical страницы — всегда боевой адрес, не адрес копии. */
export function canonicalFor(key: SiteKey, slug = ''): string {
  return liveUrl(key, slug);
}

/** Абсолютный адрес картинки для og:image (относительный путь → боевой домен).
 *  У сайта без боевого домена (RECKE) берём адрес превью: на recke.ru картинка
 *  не отдаётся, и ссылка в мессенджере приходила бы без изображения. Тот же
 *  случай, что у canonical, — он уже решён через liveUrl. */
export function absoluteUrl(key: SiteKey, path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('//')) return `https:${path}`;
  const база = liveUrl(key).replace(/\/+$/, '');
  return `${база}/${path.replace(/^\/+/, '')}`;
}

// @id и url схемы строим от liveUrl, как canonical: у сайта без боевого домена
// (RECKE) s.origin = выдуманный recke.ru, и схема ссылалась бы на чужой адрес
// (проверка выложенной версии 04.10: /404, /regulation/, /consent/).
const siteRoot = (s: SiteConfig) => liveUrl(s.key).replace(/\/+$/, '');
const orgId = (s: SiteConfig) => `${siteRoot(s)}/#organization`;
const siteId = (s: SiteConfig) => `${siteRoot(s)}/#website`;

export interface OrgOptions {
  /** картинка организации */
  image?: string;
  /** «от … до …» по всему каталогу; считается из цен, а не пишется руками */
  offers?: {
    prices: Price[];
    productName: string;
    brand?: string;
    category?: string;
    availability?: string;
    priceValidUntil?: string;
  };
}

/** LocalBusiness + WebSite — общий блок для всех страниц сайта. */
export function organizationGraph(key: SiteKey, opts: OrgOptions = {}): Record<string, unknown>[] {
  const s = getSite(key);
  const org: Record<string, unknown> = {
    '@type': 'LocalBusiness',
    '@id': orgId(s),
    name: s.brand,
    legalName: s.legal.name,
    taxID: s.legal.inn,
    url: `${siteRoot(s)}/`,
    description: s.orgDescription,
    telephone: s.phone.href.replace('tel:', ''),
    address: {
      '@type': 'PostalAddress',
      streetAddress: s.address.street,
      addressLocality: s.address.locality,
      ...(s.legal.postalCode ? { postalCode: s.legal.postalCode } : {}),
      addressCountry: s.address.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: s.geo.lat, longitude: s.geo.lng },
    areaServed: ['Москва', 'Московская область'],
    sameAs: s.sameAs,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: s.phone.href.replace('tel:', ''),
      contactType: 'sales',
      areaServed: 'RU',
      availableLanguage: 'Russian',
    },
  };

  if (opts.image) org.image = absoluteUrl(key, opts.image);

  if (opts.offers && opts.offers.prices.length) {
    const numbers = opts.offers.prices.map((p) => priceToNumber(p.value)).filter((n) => !Number.isNaN(n));
    if (numbers.length) {
      // Копейки не теряем: «32,40» → "32.40", а не "32.4". Считаем разрядность
      // по самой длинной дробной части исходных цен — руками ничего не пишем.
      const decimals = Math.max(
        0,
        ...opts.offers.prices.map((p) => (priceToSchema(p.value).split('.')[1] ?? '').length)
      );
      const fmt = (n: number) => n.toFixed(decimals);
      org.makesOffer = {
        '@type': 'AggregateOffer',
        priceCurrency: 'RUB',
        lowPrice: fmt(Math.min(...numbers)),
        highPrice: fmt(Math.max(...numbers)),
        offerCount: numbers.length,
        availability: opts.offers.availability ?? 'https://schema.org/InStock',
        ...(opts.offers.priceValidUntil ? { priceValidUntil: opts.offers.priceValidUntil } : {}),
        areaServed: 'Москва и Московская область',
        itemOffered: {
          '@type': 'Product',
          name: opts.offers.productName,
          ...(opts.offers.category ? { category: opts.offers.category } : {}),
          ...(opts.offers.brand ? { brand: { '@type': 'Brand', name: opts.offers.brand } } : {}),
        },
      };
    }
  }

  const website = {
    '@type': 'WebSite',
    '@id': siteId(s),
    url: `${siteRoot(s)}/`,
    name: s.brand,
    inLanguage: 'ru-RU',
    publisher: { '@id': orgId(s) },
  };

  return [org, website];
}

export interface ProductLdOptions {
  site: SiteKey;
  slug?: string;
  name: string;
  description?: string;
  image?: string | string[];
  brand?: string;
  category?: string;
  sku?: string;
  price?: Price;
  availability?: string;
  priceValidUntil?: string;
}

/** Product + Offer одной позиции/страницы-цвета. Цена — из данных, без ручного ввода. */
export function productJsonLd(o: ProductLdOptions): Record<string, unknown> {
  const s = getSite(o.site);
  const images = (Array.isArray(o.image) ? o.image : o.image ? [o.image] : []).map((src) =>
    absoluteUrl(o.site, src)
  );

  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: o.name,
    url: liveUrl(o.site, o.slug),
    ...(o.description ? { description: o.description } : {}),
    ...(images.length ? { image: images } : {}),
    ...(o.sku ? { sku: o.sku } : {}),
    ...(o.category ? { category: o.category } : {}),
    ...(o.brand ? { brand: { '@type': 'Brand', name: o.brand } } : {}),
  };

  if (o.price) {
    node.offers = {
      '@type': 'Offer',
      price: priceToSchema(o.price.value),
      priceCurrency: 'RUB',
      url: liveUrl(o.site, o.slug),
      availability: o.availability ?? 'https://schema.org/InStock',
      ...(o.priceValidUntil ? { priceValidUntil: o.priceValidUntil } : {}),
      seller: { '@id': orgId(s) },
    };
  }

  return node;
}

/** FAQPage — ровно по тем вопросам, которые видны на странице. */
export function faqJsonLd(items: FaqItem[], site?: SiteKey, slug = ''): Record<string, unknown> | null {
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    ...(site ? { '@id': `${liveUrl(site, slug)}#faq` } : {}),
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: stripTags(item.q),
      acceptedAnswer: { '@type': 'Answer', text: stripTags(item.a) },
    })),
  };
}

/** BreadcrumbList — на боевых сайтах хлебных крошек нет ни на одном. */
export function breadcrumbJsonLd(trail: BreadcrumbItem[], site: SiteKey): Record<string, unknown> | null {
  if (trail.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: toLiveHref(site, item.href) } : {}),
    })),
  };
}

/** Локальный путь копии → боевой адрес: '/oskol/kirpich-soloma/' → 'https://xn--…/kirpich-soloma' */
export function toLiveHref(site: SiteKey, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const base = getSite(site).base;
  const slug = href.startsWith(base) ? href.slice(base.length) : href;
  return liveUrl(site, slug);
}

/** Один @graph из нескольких узлов — чтобы на странице был один <script type="application/ld+json">. */
export function graph(nodes: (Record<string, unknown> | null | undefined)[]): Record<string, unknown> | null {
  const clean = nodes.filter(Boolean) as Record<string, unknown>[];
  if (!clean.length) return null;
  return { '@context': 'https://schema.org', '@graph': clean.map(stripContext) };
}

function stripContext(node: Record<string, unknown>): Record<string, unknown> {
  const { '@context': _drop, ...rest } = node;
  return rest;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
