/** Разделы каталога — 14 страниц этапа 1 по плану страниц
 *  (vault «Сухие смеси — разведка ассортимента и план страниц (09.10.2026)», «да» Влада 11.10).
 *
 *  Позиция попадает в раздел по своему типу (поле type в positions.json — наш классификатор,
 *  присвоенный при разборе карточки производителя). Каждая позиция живёт ровно в одном разделе.
 *
 *  ⚠️ Тексты разделов — НАВИГАЦИЯ, а не технические советы. «Когда клей, а когда тёплый раствор»,
 *  «что выбрать под крупный формат» — это факты, их даёт только производитель. Своих утверждений
 *  о применимости смесей здесь нет (замечание проверки плана 09.10). Назначение каждой смеси —
 *  в таблице, дословно по карточке производителя.
 */

export type SectionGroup = 'kladka' | 'steny' | 'plitka' | 'pol' | 'fasad';

export interface Subsection {
  /** якорь на странице */
  id: string;
  /** заголовок H2 секции */
  title: string;
  types: string[];
}

export interface Section {
  slug: string;
  group: SectionGroup;
  /** подпись в меню и плитках */
  label: string;
  title: string;
  description: string;
  h1: string;
  /** одна-две фразы под заголовком: что в разделе. Без технических утверждений. */
  lead: string;
  /** секции страницы; у раздела без подразделов — одна секция */
  parts: Subsection[];
  /** соседние разделы для блока «Следующий шаг» — только навигация */
  next: string[];
}

export const GROUPS: Record<SectionGroup, string> = {
  kladka: 'Кладка',
  steny: 'Стены',
  plitka: 'Плитка',
  pol: 'Пол',
  fasad: 'Фасад, двор, печь',
};

export const SECTIONS: Section[] = [
  {
    slug: 'kladochnye-smesi',
    group: 'kladka',
    label: 'Кладочные смеси',
    title: 'Кладочные смеси и тёплый раствор в Москве — Perel, Dauer, Основит',
    description: 'Кладочные растворы для рядовой кладки и тёплые кладочные растворы Perel, Dauer, Основит: назначение и характеристики по данным производителей, цены, доставка по Москве и области.',
    h1: 'Кладочные смеси',
    lead: 'Растворы для рядовой кладки и тёплые (теплоизоляционные) кладочные растворы трёх производителей в одной таблице.',
    parts: [
      { id: 'ryadovye', title: 'Растворы для рядовой кладки', types: ['masonry_ordinary'] },
      { id: 'teplye', title: 'Тёплый кладочный раствор', types: ['masonry_thermal'] },
    ],
    next: ['klej-dlya-blokov', 'peskobeton', 'shtukaturka-cementnaya'],
  },
  {
    slug: 'klej-dlya-blokov',
    group: 'kladka',
    label: 'Клей для блоков',
    title: 'Клей для газобетона и блоков в Москве — Perel, Dauer, Основит',
    description: 'Клей для газобетона, газосиликатных и керамзитобетонных блоков и гипсовый монтажный клей Perel, Dauer, Основит: характеристики по данным производителей, цены, доставка.',
    h1: 'Клей для газобетона и блоков',
    lead: 'Монтажные клеи для кладки блоков и гипсовый монтажный клей для гипсокартона и пазогребневых плит.',
    parts: [
      { id: 'bloki', title: 'Клей для блоков', types: ['block_adhesive'] },
      { id: 'gipsovyj', title: 'Гипсовый монтажный клей', types: ['gypsum_mounting_adhesive'] },
    ],
    next: ['kladochnye-smesi', 'shtukaturka-gipsovaya', 'shpaklevka'],
  },
  {
    slug: 'peskobeton',
    group: 'kladka',
    label: 'Пескобетон и ЦПС',
    title: 'Пескобетон и цементно-песчаные смеси М150–М400 в Москве',
    description: 'Пескобетон М300 и М400, цементно-песчаные смеси М150 и М200 Perel и Dauer: назначение и характеристики по данным производителей, цены, доставка по Москве и области.',
    h1: 'Пескобетон и цементно-песчаные смеси',
    lead: 'Сухие цементно-песчаные смеси разных марок — универсальные, штукатурные, монтажно-кладочные и пескобетон.',
    parts: [{ id: 'cps', title: 'Пескобетон и ЦПС', types: ['masonry_universal_cps'] }],
    next: ['styazhka-pola', 'kladochnye-smesi', 'shtukaturka-cementnaya'],
  },
  {
    slug: 'shtukaturka-gipsovaya',
    group: 'steny',
    label: 'Гипсовая штукатурка',
    title: 'Гипсовая штукатурка в Москве — Perel, Dauer SLIDER, Основит',
    description: 'Гипсовые штукатурки Perel, Dauer SLIDER и Основит: ручного и машинного нанесения, назначение и характеристики по данным производителей, цены, доставка по Москве и области.',
    h1: 'Гипсовая штукатурка',
    lead: 'Гипсовые штукатурки трёх производителей: назначение, толщина слоя, расход и фасовка — в одной таблице.',
    parts: [{ id: 'gipsovye', title: 'Гипсовые штукатурки', types: ['plaster_gypsum'] }],
    next: ['shpaklevka', 'shtukaturka-cementnaya', 'klej-dlya-blokov'],
  },
  {
    slug: 'shtukaturka-cementnaya',
    group: 'steny',
    label: 'Цементная штукатурка',
    title: 'Цементная и цементно-известковая штукатурка в Москве',
    description: 'Цементные и цементно-известковые штукатурки и обрызг Perel, Dauer, Основит: назначение и характеристики по данным производителей, цены, доставка по Москве и области.',
    h1: 'Цементная штукатурка',
    lead: 'Цементные и цементно-известковые штукатурки, в том числе фасадные, и составы для обрызга.',
    parts: [
      { id: 'cementnye', title: 'Цементные и цементно-известковые штукатурки', types: ['plaster_cement'] },
      { id: 'obryzg', title: 'Обрызг', types: ['plaster_facade_base'] },
    ],
    next: ['shpaklevka', 'uteplenie-fasada', 'shtukaturka-gipsovaya'],
  },
  {
    slug: 'shpaklevka',
    group: 'steny',
    label: 'Шпаклёвка',
    title: 'Шпаклёвка гипсовая, цементная и полимерная в Москве',
    description: 'Сухие шпаклёвки Perel, Dauer, Основит: гипсовые, цементные и полимерные — назначение и характеристики по данным производителей, цены, доставка по Москве и области.',
    h1: 'Шпаклёвка',
    lead: 'Сухие шпаклёвки трёх производителей: гипсовые, цементные и полимерные.',
    parts: [
      { id: 'gipsovaya', title: 'Гипсовая шпаклёвка', types: ['putty_gypsum'] },
      { id: 'cementnaya', title: 'Цементная шпаклёвка', types: ['putty_cement'] },
      { id: 'polimernaya', title: 'Полимерная шпаклёвка', types: ['putty_polymer_dry'] },
    ],
    next: ['shtukaturka-gipsovaya', 'shtukaturka-cementnaya', 'plitochnyj-klej'],
  },
  {
    slug: 'plitochnyj-klej',
    group: 'plitka',
    label: 'Плиточный клей',
    title: 'Плиточный клей в Москве — Perel, Dauer CONECTOR, Основит',
    description: 'Плиточный клей Perel, Dauer CONECTOR и Основит: для керамической плитки, керамогранита, камня — класс и назначение по данным производителей, цены, доставка по Москве и области.',
    h1: 'Плиточный клей',
    lead: 'Плиточные клеи трёх производителей. Фильтр «керамогранит и крупный формат» оставляет клеи, у которых это названо в назначении у производителя.',
    parts: [{ id: 'klei', title: 'Плиточные клеи', types: ['tile_adhesive'] }],
    next: ['zatirka', 'gidroizolyaciya', 'nalivnoj-pol'],
  },
  {
    slug: 'zatirka',
    group: 'plitka',
    label: 'Затирка',
    title: 'Затирка для швов плитки и камня в Москве — Perel, Основит',
    description: 'Сухие затирки для швов плитки, клинкера и камня Perel и Основит: назначение, ширина шва и характеристики по данным производителей, цены, доставка.',
    h1: 'Затирка для швов плитки и камня',
    lead: 'Сухие цементные затирки для швов облицовки.',
    parts: [{ id: 'zatirki', title: 'Затирки', types: ['tile_grout'] }],
    next: ['plitochnyj-klej', 'gidroizolyaciya'],
  },
  {
    slug: 'styazhka-pola',
    group: 'pol',
    label: 'Стяжка',
    title: 'Смесь для стяжки пола в Москве — Perel, Dauer, Основит',
    description: 'Сухие смеси для стяжки пола Perel, Dauer PLATTER и Основит: толщина слоя и характеристики по данным производителей, цены, доставка по Москве и области.',
    h1: 'Смеси для стяжки пола',
    lead: 'Стяжки трёх производителей: толщина слоя, прочность и фасовка — в одной таблице.',
    parts: [{ id: 'styazhki', title: 'Стяжки', types: ['floor_screed'] }],
    next: ['nalivnoj-pol', 'peskobeton', 'plitochnyj-klej'],
  },
  {
    slug: 'nalivnoj-pol',
    group: 'pol',
    label: 'Наливной пол',
    title: 'Наливной пол и ровнители в Москве — Perel, Dauer PLATTER, Основит',
    description: 'Наливные полы и ровнители Perel, Dauer PLATTER и Основит: толщина слоя, время до хождения и характеристики по данным производителей, цены, доставка.',
    h1: 'Наливной пол и ровнители',
    lead: 'Наливные полы и ровнители трёх производителей.',
    parts: [{ id: 'nalivnye', title: 'Наливные полы и ровнители', types: ['floor_self_leveling'] }],
    next: ['styazhka-pola', 'plitochnyj-klej', 'gidroizolyaciya'],
  },
  {
    slug: 'gidroizolyaciya',
    group: 'plitka',
    label: 'Гидроизоляция',
    title: 'Сухая гидроизоляция и гидропломба в Москве — Perel, Основит',
    description: 'Сухие гидроизоляционные смеси, гидропломба и ремонтные составы для бетона Perel и Основит: назначение и характеристики по данным производителей, цены, доставка.',
    h1: 'Гидроизоляция и ремонт бетона',
    lead: 'Сухие обмазочные и проникающие гидроизоляционные смеси, гидропломба и ремонтные составы.',
    parts: [
      { id: 'gidroizolyaciya', title: 'Сухая гидроизоляция и гидропломба', types: ['waterproofing_dry', 'hydroplug'] },
      { id: 'remont', title: 'Ремонт бетона', types: ['concrete_repair', 'special_mortar'] },
    ],
    next: ['plitochnyj-klej', 'nalivnoj-pol', 'styazhka-pola'],
  },
  {
    slug: 'uteplenie-fasada',
    group: 'fasad',
    label: 'Утепление фасада',
    title: 'Клей для утеплителя и базовый слой фасада в Москве',
    description: 'Клеевые и штукатурно-клеевые смеси для систем утепления фасада и сухие декоративные штукатурки Perel и Основит: характеристики по данным производителей, цены, доставка.',
    h1: 'Смеси для утепления фасада',
    lead: 'Клеевые и базовые штукатурные смеси для систем утепления фасада и сухие минеральные декоративные штукатурки.',
    parts: [
      { id: 'kleevye', title: 'Клей для утеплителя и базовый слой', types: ['etics_adhesive_base'] },
      { id: 'dekorativnye', title: 'Декоративные штукатурки (сухие)', types: ['decorative_plaster_dry'] },
    ],
    next: ['shtukaturka-cementnaya', 'shpaklevka'],
  },
  {
    slug: 'smesi-dlya-bruschatki',
    group: 'fasad',
    label: 'Смеси для брусчатки',
    title: 'Смеси для брусчатки и тротуарной плитки в Москве — Perel, Основит',
    description: 'Сухие смеси для укладки брусчатки и тротуарной плитки Perel RodStone и Основит Флайформ: подстилающие и клеевые растворы, смеси для швов — по данным производителей, цены.',
    h1: 'Смеси для брусчатки и тротуарной плитки',
    lead: 'Подстилающие и дренажные растворы, клеи и смеси для заполнения швов мощения.',
    parts: [{ id: 'moshchenie', title: 'Смеси для мощения', types: ['paving_mix'] }],
    next: ['peskobeton', 'gidroizolyaciya'],
  },
  {
    slug: 'pechnye-smesi',
    group: 'fasad',
    label: 'Печные смеси',
    title: 'Смеси для печей и каминов в Москве — Основит Печформ',
    description: 'Печные, огнеупорные и термостойкие смеси Основит Печформ для кладки и облицовки печей и каминов: назначение и характеристики по данным производителя, цены, доставка.',
    h1: 'Смеси для печей и каминов',
    lead: 'Огнеупорные и печные кладочные смеси, термостойкий клей и штукатурка.',
    parts: [{ id: 'pechnye', title: 'Печные смеси', types: ['stove_mix'] }],
    next: ['kladochnye-smesi', 'plitochnyj-klej'],
  },
];

export function sectionBySlug(slug: string): Section {
  const s = SECTIONS.find((x) => x.slug === slug);
  if (!s) throw new Error(`Нет раздела ${slug}`);
  return s;
}
