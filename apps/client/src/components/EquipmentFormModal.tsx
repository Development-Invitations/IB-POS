import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "./icons";
import { API_BASE, ApiError, createEquipment, updateEquipment, uploadEquipmentImage } from "../lib/api";
import { resizeImageToJpeg } from "../lib/resize-image";
import type { ApiEquipment, EquipmentKind } from "../types/api";
import type { AuthSession } from "../types/auth";

interface EquipmentFormModalProps {
  session: AuthSession;
  equipment: ApiEquipment | null;
  onClose: () => void;
  onSaved: (equipment: ApiEquipment) => void;
}

const KINDS: EquipmentKind[] = [
  "FISCAL_REGISTRAR",
  "CASH_DRAWER",
  "CUSTOMER_DISPLAY",
  "PAYMENT_TERMINAL",
  "BARCODE_SCANNER",
  "OTHER",
];

type ConnectionMode = "com" | "ip" | "bluetooth" | "usb";

// Те же паттерны, что и на сервере (equipment.service.ts) — нужны здесь только чтобы при
// редактировании понять, в каком режиме показать форму, сама проверка при сохранении не
// выполняется.
const IP_PATTERN =
  /\b((?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})(?::(\d{1,5}))?\b/;
const COM_PATTERN = /\bCOM(\d{1,3})\b/i;
const BT_PATTERN = /^BT\s+(.+)$/i;
const USB_PATTERN = /^USB\s+(.+)$/i;

function parseIp(info: string | null | undefined): { ip: string; port: string } | null {
  const match = info?.match(IP_PATTERN);
  return match ? { ip: match[1], port: match[2] ?? "" } : null;
}

function parseCom(info: string | null | undefined): string | null {
  const match = info?.match(COM_PATTERN);
  return match ? `COM${match[1]}` : null;
}

function parseBt(info: string | null | undefined): string | null {
  const match = info?.match(BT_PATTERN);
  return match ? match[1].trim() : null;
}

function parseUsb(info: string | null | undefined): string | null {
  const match = info?.match(USB_PATTERN);
  return match ? match[1].trim() : null;
}

export function EquipmentFormModal({ session, equipment, onClose, onSaved }: EquipmentFormModalProps) {
  const { t } = useTranslation();
  const isEdit = equipment !== null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialIp = parseIp(equipment?.connectionInfo);
  const initialBt = !initialIp ? parseBt(equipment?.connectionInfo) : null;
  const initialUsb = !initialIp && !initialBt ? parseUsb(equipment?.connectionInfo) : null;
  const initialCom = !initialIp && !initialBt && !initialUsb ? parseCom(equipment?.connectionInfo) : null;

  const [kind, setKind] = useState<EquipmentKind>(equipment?.kind ?? "OTHER");
  const [label, setLabel] = useState(equipment?.label ?? "");
  const [description, setDescription] = useState(equipment?.description ?? "");
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(
    initialIp ? "ip" : initialBt ? "bluetooth" : initialUsb ? "usb" : "com",
  );
  const [comPort, setComPort] = useState(initialCom ?? "");
  const [ipAddress, setIpAddress] = useState(initialIp?.ip ?? "");
  const [ipPort, setIpPort] = useState(initialIp?.port ?? "");
  const [btName, setBtName] = useState(initialBt ?? "");
  const [usbName, setUsbName] = useState(initialUsb ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    equipment?.imageUrl ? `${API_BASE}${equipment.imageUrl}` : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imageFile && previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imageFile && previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleRemoveImage() {
    if (imageFile && previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const connectionInfo =
        connectionMode === "ip"
          ? ipAddress.trim()
            ? `IP ${ipAddress.trim()}${ipPort.trim() ? `:${ipPort.trim()}` : ""}`
            : undefined
          : connectionMode === "bluetooth"
            ? btName.trim()
              ? `BT ${btName.trim()}`
              : undefined
            : connectionMode === "usb"
              ? usbName.trim()
                ? `USB ${usbName.trim()}`
                : undefined
              : comPort.trim() || undefined;

      const payload = {
        kind,
        label: label.trim(),
        description: description.trim() || undefined,
        connectionInfo,
      };
      let saved = isEdit
        ? await updateEquipment(session.accessToken, equipment.id, payload)
        : await createEquipment(session.accessToken, payload);

      if (imageFile) {
        const resized = await resizeImageToJpeg(imageFile);
        saved = await uploadEquipmentImage(session.accessToken, saved.id, resized, "photo.jpg");
      }

      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("equipment.saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = label.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? t("equipment.editTitle") : t("equipment.addTitle")}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-accent/50"
            >
              {previewUrl ? (
                <img src={previewUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs">{t("products.photo")}</span>
              )}
            </button>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-medium text-accent hover:underline"
              >
                {previewUrl ? t("products.changePhoto") : t("products.addPhoto")}
              </button>
              {previewUrl && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="text-left text-xs font-medium text-slate-400 hover:text-slate-700"
                >
                  {t("products.removePhoto")}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePickImage}
              className="hidden"
            />
          </div>

          <label className="block text-xs font-medium text-slate-500">
            {t("equipment.kind")}
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as EquipmentKind)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`equipment.devices.${k.toLowerCase()}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-slate-500">
            {t("equipment.label")}
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              placeholder={t("equipment.labelPlaceholder")}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="block text-xs font-medium text-slate-500">
            {t("equipment.description")}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("equipment.descriptionPlaceholder")}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <div>
            <span className="block text-xs font-medium text-slate-500">{t("equipment.connectionMode")}</span>
            <div className="mt-1 grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setConnectionMode("com")}
                className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                  connectionMode === "com" ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t("equipment.connectionModeCom")}
              </button>
              <button
                type="button"
                onClick={() => setConnectionMode("ip")}
                className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                  connectionMode === "ip" ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t("equipment.connectionModeIp")}
              </button>
              <button
                type="button"
                onClick={() => setConnectionMode("bluetooth")}
                className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                  connectionMode === "bluetooth" ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t("equipment.connectionModeBluetooth")}
              </button>
              <button
                type="button"
                onClick={() => setConnectionMode("usb")}
                className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                  connectionMode === "usb" ? "bg-accent text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t("equipment.connectionModeUsb")}
              </button>
            </div>
          </div>

          {connectionMode === "com" && (
            <label className="block text-xs font-medium text-slate-500">
              {t("equipment.comPort")}
              <input
                value={comPort}
                onChange={(e) => setComPort(e.target.value)}
                placeholder={t("equipment.comPortPlaceholder")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-400">{t("equipment.comHint")}</span>
            </label>
          )}

          {connectionMode === "ip" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-slate-500">
                {t("equipment.ipAddress")}
                <input
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="192.168.1.20"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                {t("equipment.ipPort")}
                <input
                  value={ipPort}
                  onChange={(e) => setIpPort(e.target.value)}
                  placeholder="9100"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <span className="col-span-2 text-[11px] font-normal text-slate-400">
                {t("equipment.ipHint")}
              </span>
            </div>
          )}

          {connectionMode === "bluetooth" && (
            <label className="block text-xs font-medium text-slate-500">
              {t("equipment.btName")}
              <input
                value={btName}
                onChange={(e) => setBtName(e.target.value)}
                placeholder={t("equipment.btNamePlaceholder")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-400">{t("equipment.btHint")}</span>
            </label>
          )}

          {connectionMode === "usb" && (
            <label className="block text-xs font-medium text-slate-500">
              {t("equipment.usbName")}
              <input
                value={usbName}
                onChange={(e) => setUsbName(e.target.value)}
                placeholder={t("equipment.usbNamePlaceholder")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-400">{t("equipment.usbHint")}</span>
            </label>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50"
          >
            {t("returns.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {submitting ? t("common.loading") : t("products.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
