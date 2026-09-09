import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';

export interface InvoiceItemProposal {
  name: string;
  barcode?: string | null;
  quantity?: number | null;
  markingCodes?: string[];
  price?: number | null;
  missingFields: string[];
}

export interface InvoiceExtractionResult {
  items: InvoiceItemProposal[];
}

// Не из исходного ТЗ — по прямому запросу клиента: сначала пробовали облачный Claude API
// (клиент попросил бесплатный/локальный вариант), затем полностью локальный OCR+Ollama на этом
// ПК без видеокарты (упёрлись в качество и скорость на процессоре — см. обсуждение в чате
// 2026-09-09), в итоге клиент сам нашёл Groq (console.groq.com) — облачный, но с бесплатным
// тарифом и очень быстрым инференсом (LPU-железо), плюс у их qwen-моделей есть vision — фото
// накладной понимается напрямую моделью, без отдельного OCR-шага. PDF с текстовым слоем и Excel
// по-прежнему не нуждаются в vision — их текст просто идёт в ту же модель.
const GROQ_MODEL_DEFAULT = 'qwen/qwen3.6-27b';

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

const SYSTEM_PROMPT = `Ты — ассистент приёмки товара для POS-системы IB-POS (Узбекистан). Тебе дают
накладную (фото, текст из PDF или содержимое Excel-таблицы) и просят извлечь из неё каждую
товарную позицию построчно: название, штрихкод, количество, коды маркировки (Data Matrix /
"Честный знак"), цену за единицу.

Правила:
1. Название товара сохраняй ТОЧНО на том языке и алфавите, каким оно написано — русский,
   узбекская латиница или узбекская кириллица. НИКОГДА не переводи и не транслитерируй.
2. Если строку невозможно разобрать полностью, включи то, что удалось прочитать, и перечисли
   недостающие поля в missingFields (одно или несколько из: name, barcode, quantity,
   markingCodes, price). Поле name обязательно должно быть заполнено хоть каким-то текстом —
   если название совсем нечитаемо, укажи "?" и добавь "name" в missingFields.
3. Не выдумывай значения, которых нет в документе. Пустое/нечитаемое поле — это missingFields,
   а не догадка.
4. barcode и markingCodes — это ТЕКСТ, а не число, даже если состоят только из цифр. Копируй их
   символ в символ, включая ведущие нули (например, "00460003..." — это ровно то, что нужно
   вернуть, а не "460003..." без нулей в начале). Не округляй, не сокращай, не приводи к числу.
5. Штрихкод на этикетке иногда напечатан в формате GS1 с идентификатором применения в скобках
   перед цифрами, например "(00)466003779210000018" или "(01)04780000123456". Скобки и число
   в них — это НЕ отдельная метка/категория, а часть самого кода. В таком случае верни barcode
   БЕЗ скобок, но С этими цифрами приклеенными в начало: "(00)466003779210000018" →
   "00466003779210000018". Никогда не отбрасывай и не выноси отдельно часть в скобках.
6. Каждая отдельная строка таблицы накладной — это отдельный элемент в products.
7. Ответ — ТОЛЬКО JSON по заданной схеме, без пояснений.`;

const USER_INSTRUCTION =
  'Извлеки все товарные позиции из этой накладной и верни их в поле products.';

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          barcode: { type: ['string', 'null'] },
          quantity: { type: ['number', 'null'] },
          markingCodes: { type: 'array', items: { type: 'string' } },
          price: { type: ['number', 'null'] },
          missingFields: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['name', 'barcode', 'quantity', 'markingCodes', 'price'],
            },
          },
        },
        required: [
          'name',
          'barcode',
          'quantity',
          'markingCodes',
          'price',
          'missingFields',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['products'],
  additionalProperties: false,
};

// Не из исходного ТЗ — по прямому запросу клиента: LLM при чтении длинных цифровых кодов иногда
// "теряет" ОДИН ведущий ноль (воспринимает строку как число несмотря на схему type: string и
// явное правило в SYSTEM_PROMPT) — например, "046600..." приходит как "46600...". Восстанавливаем
// только когда не хватает РОВНО одной цифры до ближайшей стандартной длины штрихкода
// (EAN-8/UPC-A/EAN-13/ITF-14) — если не хватает двух и больше, это уже не различить от короткого
// нестандартного кода (внутренний/складской), и досочинять цифры наугад рискованнее, чем оставить
// как есть. Коды длиннее 14 цифр (кастомные/маркировочные) сюда не попадают вовсе.
const STANDARD_BARCODE_LENGTHS = [8, 12, 13, 14];

// GS1 Application Identifier в скобках перед числом — например, "(00)466003779210000018".
// В отличие от восстановления нулей ниже, это не догадка: скобки физически не могут быть
// частью настоящего цифрового штрихкода, так что их можно снимать безусловно, склеивая
// идентификатор с остальными цифрами (см. правило 5 в SYSTEM_PROMPT — модель иногда всё равно
// присылает их как есть, несмотря на инструкцию).
function stripGs1ApplicationIdentifier(raw: string): string {
  const match = /^\((\d{2,4})\)(\d+)$/.exec(raw);
  return match ? match[1] + match[2] : raw;
}

function normalizeBarcode(item: InvoiceItemProposal): InvoiceItemProposal {
  const trimmed = item.barcode?.trim();
  if (!trimmed) return item;
  const raw = stripGs1ApplicationIdentifier(trimmed);

  if (!/^\d+$/.test(raw) || STANDARD_BARCODE_LENGTHS.includes(raw.length)) {
    return raw === trimmed ? item : { ...item, barcode: raw };
  }
  const target = STANDARD_BARCODE_LENGTHS.find((len) => len === raw.length + 1);
  if (!target) return raw === trimmed ? item : { ...item, barcode: raw };
  return { ...item, barcode: raw.padStart(target, '0') };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private groq: Groq | null = null;

  constructor(private readonly config: ConfigService) {}

  private getGroq(): Groq {
    if (!this.groq) {
      const apiKey = this.config.get<string>('GROQ_API_KEY');
      if (!apiKey) {
        throw new BadRequestException(
          'ИИ-ассистент не настроен на сервере (нет GROQ_API_KEY)',
        );
      }
      this.groq = new Groq({ apiKey });
    }
    return this.groq;
  }

  async extractInvoice(
    file: Express.Multer.File,
  ): Promise<InvoiceExtractionResult> {
    const model = this.config.get<string>('GROQ_MODEL') ?? GROQ_MODEL_DEFAULT;
    const content = await this.buildUserContent(file);

    try {
      const response = await this.getGroq().chat.completions.create({
        model,
        temperature: 0,
        // Не из исходного ТЗ: бесплатный тариф Groq для этой модели ограничивает не только
        // TPM, но и отдельно output-токены в минуту (OTPM) — по умолчанию SDK резервирует под
        // ответ 2048 токенов и упирается в лимит ещё до генерации. Ставим потолок с запасом
        // под лимит, этого хватает на обычную накладную из нескольких десятков строк.
        max_completion_tokens: 900,
        // qwen3.6 по умолчанию "думает" (chain-of-thought) перед ответом и тратит на это
        // весь token-бюджет, не оставляя места на сам JSON — reasoning_effort: 'none' убирает
        // размышления, они тут и не нужны, задача чисто извлечение данных по схеме.
        reasoning_effort: 'none',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'propose_invoice_items',
            schema: RESPONSE_JSON_SCHEMA,
            strict: true,
          },
        },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
      });

      const raw = response.choices[0]?.message?.content;
      if (!raw) {
        throw new BadRequestException(
          'Не удалось распознать накладную — попробуйте другое фото или файл',
        );
      }

      let parsed: { products?: InvoiceItemProposal[] };
      try {
        parsed = JSON.parse(raw) as { products?: InvoiceItemProposal[] };
      } catch {
        throw new BadRequestException(
          'Модель вернула не то, что ожидалось — попробуйте ещё раз',
        );
      }
      return { items: (parsed.products ?? []).map(normalizeBarcode) };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(
        'Groq invoice extraction failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new BadRequestException(
        'Не удалось обработать накладную. Проверьте файл и попробуйте снова.',
      );
    }
  }

  private async buildUserContent(
    file: Express.Multer.File,
  ): Promise<Groq.Chat.Completions.ChatCompletionContentPart[]> {
    if ((IMAGE_MEDIA_TYPES as readonly string[]).includes(file.mimetype)) {
      const dataUrl = `data:${file.mimetype as ImageMediaType};base64,${file.buffer.toString('base64')}`;
      return [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: USER_INSTRUCTION },
      ];
    }

    if (file.mimetype === 'application/pdf') {
      const parser = new PDFParse({ data: file.buffer });
      try {
        const result = await parser.getText();
        if (!result.text.trim()) {
          throw new BadRequestException(
            'В этом PDF нет текстового слоя (похоже на скан) — пришлите фото страницы вместо PDF',
          );
        }
        return [
          {
            type: 'text',
            text: `Текст накладной из PDF:\n\n${result.text}\n\n${USER_INSTRUCTION}`,
          },
        ];
      } finally {
        await parser.destroy();
      }
    }

    // Excel (.xlsx/.xls) — просто таблица, vision тут не нужен, парсим напрямую.
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheets = workbook.SheetNames.map((sheetName) => {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
      return `Лист "${sheetName}":\n${csv}`;
    }).join('\n\n');
    if (!sheets.trim()) {
      throw new BadRequestException(
        'Excel-файл пустой или не удалось его прочитать',
      );
    }
    return [
      {
        type: 'text',
        text: `Данные из Excel-файла накладной:\n\n${sheets}\n\n${USER_INSTRUCTION}`,
      },
    ];
  }
}
