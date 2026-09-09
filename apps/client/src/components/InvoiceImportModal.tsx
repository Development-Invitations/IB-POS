import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, createProduct, extractInvoiceItems, receiveStock } from "../lib/api";
import { useEscapeClose } from "../lib/use-escape-close";
import { CloseIcon, SparkleIcon } from "./icons";
import type { InvoiceItemProposal } from "../types/api";
import type { AuthSession } from "../types/auth";

interface InvoiceImportModalProps {
  session: AuthSession;
  storeId: string;
  // Не из исходного ТЗ — по прямому запросу клиента: для Магазина и Аптеки штрихкод обязателен
  // — ИИ иногда не может прочитать его на фото/накладной, и раньше товар всё равно создавался
  // без штрихкода, что клиент не хочет (см. тот же флаг в ProductFormModal). Для Ресторана не
  // актуально — там штрихкоды не используются.
  requireBarcode?: boolean;
  onClose: () => void;
  // Не из исходного ТЗ — по прямому запросу клиента: после создания товара из накладной
  // "Склад" должен перечитать список товаров и остатки — та же причина, что и у onStockChanged
  // в остальных местах WarehouseScreen.tsx (иначе новый товар не появится до перезагрузки).
  onItemCreated: () => void;
}

const ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

const MISSING_FIELD_KEY: Record<string, string> = {
  name: "invoiceImport.missingName",
  barcode: "invoiceImport.missingBarcode",
  quantity: "invoiceImport.missingQuantity",
  markingCodes: "invoiceImport.missingMarkingCodes",
  price: "invoiceImport.missingPrice",
};

interface RowState {
  item: InvoiceItemProposal;
  status: "pending" | "creating" | "created" | "error";
  error: string | null;
}

export function InvoiceImportModal({
  session,
  storeId,
  requireBarcode,
  onClose,
  onItemCreated,
}: InvoiceImportModalProps) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [rows, setRows] = useState<RowState[] | null>(null);

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setExtractError(null);
    setRows(null);
    setExtracting(true);
    try {
      const result = await extractInvoiceItems(session.accessToken, file, file.name);
      setRows(result.items.map((item) => ({ item, status: "pending", error: null })));
    } catch (err) {
      setExtractError(err instanceof ApiError ? err.message : t("invoiceImport.extractError"));
    } finally {
      setExtracting(false);
    }
  }

  function updateRowItem(index: number, patch: Partial<InvoiceItemProposal>) {
    setRows((prev) =>
      prev ? prev.map((row, i) => (i === index ? { ...row, item: { ...row.item, ...patch } } : row)) : prev,
    );
  }

  async function createRow(index: number) {
    const row = rows?.[index];
    if (!row || row.status === "creating" || row.status === "created") return;
    if (!row.item.name.trim()) return;
    if (requireBarcode && !row.item.barcode?.trim()) return;

    setRows((prev) => (prev ? prev.map((r, i) => (i === index ? { ...r, status: "creating", error: null } : r)) : prev));
    try {
      const created = await createProduct(session.accessToken, {
        name: row.item.name.trim(),
        barcode: row.item.barcode?.trim() || undefined,
        // Цена 0 — та же конвенция, что и у приёма по маркировке (WarehouseScreen::handleQuickCreate):
        // "цену внесём позже по накладной", товар с price=0 просто нельзя продать до правки.
        price: row.item.price && row.item.price > 0 ? row.item.price : 0,
        unit: "pcs",
      });
      if (row.item.quantity && row.item.quantity > 0) {
        await receiveStock(session.accessToken, {
          storeId,
          productId: created.id,
          quantity: row.item.quantity,
          comment: t("invoiceImport.receiveComment"),
          markingCodes: row.item.markingCodes && row.item.markingCodes.length > 0 ? row.item.markingCodes : undefined,
        });
      }
      setRows((prev) => (prev ? prev.map((r, i) => (i === index ? { ...r, status: "created" } : r)) : prev));
      onItemCreated();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("invoiceImport.createItemError");
      setRows((prev) => (prev ? prev.map((r, i) => (i === index ? { ...r, status: "error", error: message } : r)) : prev));
    }
  }

  const readyCount = rows?.filter((r) => r.status === "created").length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <SparkleIcon width={20} height={20} className="text-accent" />
            {t("invoiceImport.title")}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-sm text-slate-500">{t("invoiceImport.hint")}</p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting}
              className="rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-accent hover:border-accent/50 disabled:opacity-50"
            >
              {t("invoiceImport.pickFile")}
            </button>
            <input ref={fileInputRef} type="file" accept={ACCEPT} onChange={handlePickFile} className="hidden" />
            {fileName && <span className="truncate text-xs text-slate-400">{fileName}</span>}
          </div>
          <p className="text-xs text-slate-400">{t("invoiceImport.pickFileHint")}</p>

          {extracting && <p className="text-sm text-slate-500">{t("invoiceImport.extracting")}</p>}
          {extractError && <p className="text-sm text-red-600">{extractError}</p>}

          {rows && rows.length === 0 && !extracting && (
            <p className="text-sm text-slate-500">{t("invoiceImport.resultsEmpty")}</p>
          )}

          {rows && rows.length > 0 && (
            <div className="space-y-2">
              {rows.map((row, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={row.item.name}
                      onChange={(e) => updateRowItem(index, { name: e.target.value })}
                      disabled={row.status === "created"}
                      placeholder={t("invoiceImport.fieldName")}
                      className="min-w-[10rem] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-accent disabled:bg-slate-50"
                    />
                    <input
                      value={row.item.barcode ?? ""}
                      onChange={(e) => updateRowItem(index, { barcode: e.target.value })}
                      disabled={row.status === "created"}
                      placeholder={t("invoiceImport.fieldBarcode")}
                      className="w-36 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-accent disabled:bg-slate-50"
                    />
                    <input
                      type="number"
                      min={0}
                      value={row.item.quantity ?? ""}
                      onChange={(e) => updateRowItem(index, { quantity: e.target.value ? Number(e.target.value) : undefined })}
                      disabled={row.status === "created"}
                      placeholder={t("invoiceImport.fieldQuantity")}
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-accent disabled:bg-slate-50"
                    />
                    <input
                      type="number"
                      min={0}
                      value={row.item.price ?? ""}
                      onChange={(e) => updateRowItem(index, { price: e.target.value ? Number(e.target.value) : undefined })}
                      disabled={row.status === "created"}
                      placeholder={t("invoiceImport.fieldPrice")}
                      className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-accent disabled:bg-slate-50"
                    />
                    <button
                      onClick={() => createRow(index)}
                      disabled={
                        row.status === "creating" ||
                        row.status === "created" ||
                        !row.item.name.trim() ||
                        (requireBarcode && !row.item.barcode?.trim())
                      }
                      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                    >
                      {row.status === "created" ? t("invoiceImport.createdItem") : t("invoiceImport.createItem")}
                    </button>
                  </div>
                  {row.item.missingFields.length > 0 && row.status !== "created" && (
                    <p className="mt-1.5 text-xs text-amber-600">
                      {t("invoiceImport.missingPrefix")}{" "}
                      {row.item.missingFields.map((f) => t(MISSING_FIELD_KEY[f] ?? f)).join(", ")}
                    </p>
                  )}
                  {requireBarcode && !row.item.barcode?.trim() && row.status !== "created" && (
                    <p className="mt-1.5 text-xs text-red-600">{t("invoiceImport.barcodeRequiredHint")}</p>
                  )}
                  {row.status === "error" && row.error && (
                    <p className="mt-1.5 text-xs text-red-600">{row.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
          <span>{rows ? t("invoiceImport.summaryCreated", { count: readyCount, total: rows.length }) : ""}</span>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-accent/40">
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
