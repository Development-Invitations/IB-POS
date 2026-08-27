import ts from "typescript";
import fg from "fast-glob";
import { readFileSync } from "node:fs";

// Ищет JSX-текст и строковые литералы в UI-атрибутах (placeholder/title/alt/aria-label),
// содержащие буквы (RU/UZ), не обёрнутые в t(...). Цель — поймать захардкоженные строки в UI.

const TEXT_ATTRS = new Set(["placeholder", "title", "alt", "aria-label"]);
const HAS_LETTERS = /\p{L}{2,}/u;
// Название продукта — не UI-текст, перевода не требует.
const ALLOWLIST = new Set(["IB-POS"]);

interface Violation {
  file: string;
  line: number;
  text: string;
}

function checkFile(file: string): Violation[] {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: Violation[] = [];

  function report(node: ts.Node, text: string) {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    violations.push({ file, line: line + 1, text: text.trim() });
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (text && HAS_LETTERS.test(text) && !ALLOWLIST.has(text)) {
        report(node, text);
      }
    }

    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const attrName = node.name.getText(sf);
      const value = node.initializer.text;
      if (TEXT_ATTRS.has(attrName) && HAS_LETTERS.test(value) && !ALLOWLIST.has(value)) {
        report(node, `${attrName}="${value}"`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return violations;
}

async function main() {
  const files = await fg(["../../../apps/client/src/**/*.{tsx,ts}"], {
    cwd: import.meta.dirname,
    absolute: true,
    ignore: ["**/*.d.ts"],
  });

  const allViolations = files.flatMap(checkFile);

  if (allViolations.length > 0) {
    console.error(`\nНайдены захардкоженные строки в UI (${allViolations.length}):\n`);
    for (const v of allViolations) {
      console.error(`  ${v.file}:${v.line}  ${v.text}`);
    }
    console.error("\nИспользуйте t('key') из @ib-pos/i18n вместо буквальных строк.\n");
    process.exit(1);
  }

  console.log(`i18n-lint: OK, захардкоженных строк не найдено (проверено файлов: ${files.length}).`);
}

main();
