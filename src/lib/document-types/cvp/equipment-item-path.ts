const ITEM_FIELD_RE = /^items\.(\d+)$/;
const EQUIPMENT_ORDINAL_RE = /^15\.(\d+)\b/;

export function isCvpEquipmentItemField(path: string): boolean {
  return ITEM_FIELD_RE.test(path);
}

export function cvpEquipmentItemIndex(path: string): number | null {
  const match = ITEM_FIELD_RE.exec(path);
  if (!match) return null;
  return Number(match[1]);
}

/** `items.N` or `15.N` / `15.N TITLE` → 0-based item index. `15.2.3` is item 15.2. */
export function cvpEquipmentItemIndexFromTarget(target: string): number | null {
  const trimmed = target.trim();
  const item = cvpEquipmentItemIndex(trimmed);
  if (item != null) return item;
  const ordinal = EQUIPMENT_ORDINAL_RE.exec(trimmed);
  if (!ordinal) return null;
  const n = Number(ordinal[1]);
  if (!Number.isInteger(n) || n < 1) return null;
  return n - 1;
}
