/**
 * Clamp model tool input to the tool's own JSON Schema.
 *
 * Gemini regularly overshoots advertised bounds (the search_documents incident
 * sent 8 queries with limit 20 against maxItems 4 / maximum 16). Zod then
 * throws `AI_InvalidToolInputError`, which surfaces to the engineer as a failed
 * turn. This is the last-resort repair: it only runs after a call has already
 * been rejected, so a clamp that still does not validate is no worse than today.
 *
 * Only bounds and obvious type slips are repaired. Nothing is invented: a value
 * that cannot be salvaged is dropped so the schema default (if any) applies.
 */

export type ToolJsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  maxLength?: number;
  maxItems?: number;
  maximum?: number;
  minimum?: number;
  properties?: Record<string, ToolJsonSchema>;
  items?: ToolJsonSchema | ToolJsonSchema[];
  [key: string]: unknown;
};

const DROP = Symbol("drop");
type Clamped = unknown | typeof DROP;

function schemaAllows(schema: ToolJsonSchema, type: string): boolean {
  const declared = schema.type;
  if (declared === undefined) return false;
  return Array.isArray(declared) ? declared.includes(type) : declared === type;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clampString(value: unknown, schema: ToolJsonSchema): Clamped {
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : null;
  if (text === null) return DROP;
  const max = schema.maxLength;
  return typeof max === "number" && text.length > max ? text.slice(0, max) : text;
}

function clampNumber(value: unknown, schema: ToolJsonSchema): Clamped {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(parsed)) return DROP;
  let next = parsed;
  if (typeof schema.minimum === "number") next = Math.max(schema.minimum, next);
  if (typeof schema.maximum === "number") next = Math.min(schema.maximum, next);
  if (schemaAllows(schema, "integer")) next = Math.trunc(next);
  return next;
}

function clampBoolean(value: unknown): Clamped {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return DROP;
}

function itemSchemaAt(schema: ToolJsonSchema, index: number): ToolJsonSchema {
  const { items } = schema;
  if (Array.isArray(items)) return items[index] ?? {};
  return items ?? {};
}

function clampArray(value: unknown, schema: ToolJsonSchema): Clamped {
  // A single value where a list is expected is a common model slip.
  const source = Array.isArray(value) ? value : [value];
  const out: unknown[] = [];
  for (const [index, item] of source.entries()) {
    const clamped = clampToolInputToSchema(item, itemSchemaAt(schema, index));
    if (clamped === DROP) continue;
    out.push(clamped);
  }
  const max = schema.maxItems;
  if (typeof max === "number" && out.length > max) return out.slice(0, max);
  return out;
}

function clampObject(value: unknown, schema: ToolJsonSchema): Clamped {
  if (!isPlainObject(value)) return DROP;
  const properties = schema.properties;
  if (!properties) return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const propertySchema = properties[key];
    if (!propertySchema) {
      out[key] = entry;
      continue;
    }
    const clamped = clampToolInputToSchema(entry, propertySchema);
    if (clamped === DROP) continue;
    out[key] = clamped;
  }
  return out;
}

/** Returns `DROP` when the value cannot be salvaged for this schema node. */
export function clampToolInputToSchema(
  value: unknown,
  schema: ToolJsonSchema | undefined
): Clamped {
  if (!schema || typeof schema !== "object") return value;

  if (Array.isArray(schema.enum)) {
    if (schema.enum.includes(value)) return value;
    if (typeof value === "string") {
      const match = schema.enum.find(
        (option) =>
          typeof option === "string" &&
          option.toLowerCase() === value.trim().toLowerCase()
      );
      if (match !== undefined) return match;
    }
    return DROP;
  }

  if (schemaAllows(schema, "object")) return clampObject(value, schema);
  if (schemaAllows(schema, "array")) return clampArray(value, schema);
  if (schemaAllows(schema, "string")) return clampString(value, schema);
  if (schemaAllows(schema, "number") || schemaAllows(schema, "integer")) {
    return clampNumber(value, schema);
  }
  if (schemaAllows(schema, "boolean")) return clampBoolean(value);

  // Unions (anyOf / oneOf) and untyped nodes are left alone rather than guessed.
  return value;
}

/**
 * Clamp a raw tool-call input string against the tool schema.
 * Returns `null` when the input is unparseable or already schema-shaped, so
 * callers can fall through to their existing behaviour.
 */
export function repairToolInputAgainstSchema(
  rawInput: unknown,
  schema: ToolJsonSchema | undefined
): string | null {
  if (!schema) return null;

  let parsed: unknown;
  if (typeof rawInput === "string") {
    try {
      parsed = JSON.parse(rawInput);
    } catch {
      return null;
    }
  } else {
    parsed = rawInput;
  }

  const clamped = clampToolInputToSchema(parsed, schema);
  if (clamped === DROP) return null;

  const next = JSON.stringify(clamped);
  const before = JSON.stringify(parsed);
  return next === before ? null : next;
}
