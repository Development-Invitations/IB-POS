import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
});

// CommerceML отдаёт одиночный узел как объект, а несколько — как массив.
// Приводим к единому виду, чтобы дальше не разбирать оба случая в каждом месте.
function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export interface ParsedGroup {
  externalId: string;
  name: string;
}

export interface ParsedProduct {
  externalId: string;
  name: string;
  groupExternalId?: string;
  sku?: string;
  barcode?: string;
  unit?: string;
}

export interface ParsedOffer {
  externalId: string;
  price?: number;
  quantity?: number;
}

// import.xml (или файл вида import*.xml): классификатор (группы) + каталог (товары).
export function parseClassifierAndCatalog(xml: string): {
  groups: ParsedGroup[];
  products: ParsedProduct[];
} {
  const doc = parser.parse(xml);
  const root = doc.КоммерческаяИнформация ?? {};

  const rawGroups = toArray(root.Классификатор?.Группы?.Группа);
  const groups: ParsedGroup[] = flattenGroups(rawGroups);

  const rawProducts = toArray(root.Каталог?.Товары?.Товар);
  const products: ParsedProduct[] = rawProducts
    .filter((p) => p?.Ид)
    .map((p) => ({
      externalId: String(p.Ид),
      name: String(p.Наименование ?? p.Ид),
      groupExternalId: extractFirstGroupId(p.Группы),
      sku: p.Артикул ? String(p.Артикул) : undefined,
      barcode: p.Штрихкод ? String(p.Штрихкод) : undefined,
      unit:
        p.БазоваяЕдиница?.['@_НаименованиеПолное'] ??
        p.БазоваяЕдиница ??
        undefined,
    }));

  return { groups, products };
}

// Группы в 1С могут быть вложенными; для базового режима разворачиваем в плоский список.
function flattenGroups(nodes: any[]): ParsedGroup[] {
  const result: ParsedGroup[] = [];
  for (const node of nodes) {
    if (!node?.Ид) continue;
    result.push({
      externalId: String(node.Ид),
      name: String(node.Наименование ?? node.Ид),
    });
    const children = toArray(node.Группы?.Группа);
    if (children.length) result.push(...flattenGroups(children));
  }
  return result;
}

function extractFirstGroupId(groups: unknown): string | undefined {
  if (!groups) return undefined;
  const ids = toArray((groups as { Ид?: unknown }).Ид);
  return ids.length ? String(ids[0]) : undefined;
}

// offers.xml: цены и остатки по тем же Ид, что в каталоге.
export function parseOffers(xml: string): ParsedOffer[] {
  const doc = parser.parse(xml);
  const root = doc.КоммерческаяИнформация ?? {};
  const rawOffers = toArray(root.ПакетПредложений?.Предложения?.Предложение);

  return rawOffers
    .filter((o) => o?.Ид)
    .map((o) => {
      const prices = toArray(o.Цены?.Цена);
      const price = prices.length ? Number(prices[0].ЦенаЗаЕдиницу) : undefined;
      const quantity =
        o.Количество !== undefined ? Number(o.Количество) : undefined;
      // Ид предложения иногда содержит суффикс характеристики через "#" — берём базовую часть,
      // совпадающую с Ид товара в каталоге.
      const externalId = String(o.Ид).split('#')[0];
      return { externalId, price, quantity };
    });
}
