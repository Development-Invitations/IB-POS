// Временный демо-каталог для верстки экрана "Продажа" по макету (docs/design_mockup_variant2.png).
// Названия товаров — это пользовательские данные (не UI-строки), поэтому не идут через i18n.
// Будет заменено на реальные /categories и /products из apps/server (Этап 1 API).

export type CategoryId = "all" | "drinks" | "food" | "desserts" | "tobacco" | "other";

export interface CatalogProduct {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  emoji: string;
  categoryId: Exclude<CategoryId, "all">;
}

export const CATEGORY_IDS: CategoryId[] = ["all", "drinks", "food", "desserts", "tobacco", "other"];

export const DEMO_PRODUCTS: CatalogProduct[] = [
  { id: "cappuccino", name: "Капучино", subtitle: "200 мл", price: 25000, emoji: "☕", categoryId: "drinks" },
  { id: "latte", name: "Латте", subtitle: "300 мл", price: 28000, emoji: "☕", categoryId: "drinks" },
  { id: "americano", name: "Американо", subtitle: "200 мл", price: 20000, emoji: "☕", categoryId: "drinks" },
  { id: "green-tea", name: "Чай зелёный", subtitle: "500 мл", price: 15000, emoji: "🍵", categoryId: "drinks" },
  { id: "pizza-margherita", name: "Пицца Маргарита", subtitle: "1 шт", price: 65000, emoji: "🍕", categoryId: "food" },
  { id: "burger-classic", name: "Бургер классический", subtitle: "1 шт", price: 55000, emoji: "🍔", categoryId: "food" },
  { id: "fries", name: "Картофель фри", subtitle: "150 г", price: 18000, emoji: "🍟", categoryId: "food" },
  { id: "cola", name: "Кока-Кола", subtitle: "0.5 л", price: 12000, emoji: "🥤", categoryId: "drinks" },
  { id: "tiramisu", name: "Тирамису", subtitle: "150 г", price: 32000, emoji: "🍰", categoryId: "desserts" },
  { id: "cheesecake", name: "Чизкейк", subtitle: "150 г", price: 30000, emoji: "🍰", categoryId: "desserts" },
  { id: "ice-cream", name: "Мороженое", subtitle: "1 шарик", price: 10000, emoji: "🍨", categoryId: "desserts" },
];
