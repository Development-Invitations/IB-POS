// Настройки устройства, а не организации: не через backend (ApiSettings — общие для всех
// касс организации), а localStorage конкретного моноблока. Сейчас только одна — остальные
// переключатели из макета (звук, тёмная тема, автозакрытие смены) пока нигде не задействованы
// в поведении приложения, поэтому здесь не заведены — не хотим показывать переключатель,
// который ничего не переключает.
const SHOW_PRODUCT_IMAGES_KEY = "ibpos.pref.showProductImages";

export function loadShowProductImages(): boolean {
  return localStorage.getItem(SHOW_PRODUCT_IMAGES_KEY) !== "0";
}

export function saveShowProductImages(value: boolean) {
  localStorage.setItem(SHOW_PRODUCT_IMAGES_KEY, value ? "1" : "0");
}
