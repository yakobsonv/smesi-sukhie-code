/** Меню и подвал — одни на все страницы. Состав — по плану страниц этапа 1
 *  (vault «Сухие смеси — разведка ассортимента и план страниц (09.10.2026)»):
 *  шапка «Каталог» (5 групп) · «Доставка» · «Контакты» · телефон. */
import { localPath } from '../lib/sites';
import type { NavItem } from '../lib/types';
import { GROUPS, SECTIONS, type SectionGroup } from './sections';

const p = (slug = '') => localPath('sukhie', slug);

export const PAGES = {
  home: { href: p(), label: 'Главная' },
  dostavka: { href: p('dostavka'), label: 'Доставка' },
  kontakty: { href: p('kontakty'), label: 'Контакты' },
  regulation: { href: p('regulation'), label: 'Положение об обработке персональных данных' },
} as const;

export const GROUP_ORDER: SectionGroup[] = ['kladka', 'steny', 'plitka', 'pol', 'fasad'];

/** current — slug текущей страницы ('' — главная), пункт подсвечивается. */
export function mainNav(current?: string): NavItem[] {
  const inCatalog = SECTIONS.some((s) => s.slug === current);
  return [
    {
      label: 'Каталог',
      href: `${p()}#katalog`,
      current: inCatalog,
      children: GROUP_ORDER.flatMap((g) =>
        SECTIONS.filter((s) => s.group === g).map((s) => ({
          href: p(s.slug),
          label: s.label,
          current: s.slug === current,
        })),
      ),
    },
    { href: PAGES.dostavka.href, label: 'Доставка', current: current === 'dostavka' },
    { href: PAGES.kontakty.href, label: 'Контакты', current: current === 'kontakty' },
  ];
}

export function footerColumns() {
  return [
    ...GROUP_ORDER.slice(0, 3).map((g) => ({
      title: GROUPS[g],
      links: SECTIONS.filter((s) => s.group === g).map((s) => ({ href: p(s.slug), label: s.label })),
    })),
    {
      title: `${GROUPS.pol} · ${GROUPS.fasad}`,
      links: SECTIONS.filter((s) => s.group === 'pol' || s.group === 'fasad').map((s) => ({ href: p(s.slug), label: s.label })),
    },
    { title: 'Покупателю', links: [PAGES.dostavka, PAGES.kontakty] },
  ];
}

export const POLICY_LINKS = [PAGES.regulation];
