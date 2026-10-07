const ITEM_FIELD_RE = /^items\.(\d+)$/;
const EQUIPMENT_ORDINAL_RE = /^15\.(\d+)\b/;
const EQUIPMENT_MENTION_RE = /^cvp_equipment_sampling:items\.(\d+)$/;

/** Composer @ id for one 15.N box (`cvp_equipment_sampling:items.1` = 15.2). */
export function cvpEquipmentItemMentionId(index: number): string {
  return `cvp_equipment_sampling:items.${index}`;
}

export function cvpEquipmentItemIndexFromMentionId(id: string): number | null {
  const match = EQUIPMENT_MENTION_RE.exec(id.trim());
  if (!match) return null;
  return Number(match[1]);
}

/** Strip a 15.N mention id to the parent section key; other ids pass through. */
export function chatMentionParentSection(id: string): string {
  return cvpEquipmentItemIndexFromMentionId(id) != null
    ? "cvp_equipment_sampling"
    : id;
}

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
