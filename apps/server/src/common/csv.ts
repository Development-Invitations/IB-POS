// Минимальный CSV-парсер/сериализатор (Этап 7/8 — импорт/экспорт товаров и отчётов).
// Разделитель — точка с запятой, а не запятая: у Excel на русской/узбекской локали Windows
// системный разделитель списков — ";", и при обычном открытии .csv двойным щелчком Excel режет
// строки именно по нему, а не по запятой из содержимого файла (без BOM+";" всё содержимое
// уезжало в одну колонку A). Поддерживает поля в кавычках (в т.ч. с разделителем/переводами
// строк внутри) и экранирование кавычек удвоением — этого достаточно для файлов из Excel/1С,
// не тянем отдельную библиотеку ради этого.

const DELIMITER = ';';
// BOM — иначе Excel угадывает кодировку по системной кодовой странице и кириллица превращается
// в мусор; с BOM он однозначно определяет UTF-8.
const BOM = '﻿';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  const normalized = text
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === DELIMITER) {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function escapeCell(value: string): string {
  if (
    value.includes('"') ||
    value.includes(DELIMITER) ||
    value.includes('\n')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const body = rows
    .map((row) =>
      row.map((cell) => escapeCell(String(cell ?? ''))).join(DELIMITER),
    )
    .join('\r\n');
  return BOM + body;
}
