/**
 * Overlay customer-specific criterion descriptions onto the shared list.
 * Unknown keys fail loudly so a rename cannot silently drop MJ wording.
 */
export function applyCriterionDescriptionOverrides<
  T extends { key: string; description: string },
>(
  bySection: Record<string, T[]>,
  overrides: Readonly<Record<string, string>>
): Record<string, T[]> {
  const known = new Set(
    Object.values(bySection).flatMap((list) => list.map((c) => c.key))
  );
  for (const key of Object.keys(overrides)) {
    if (!known.has(key)) {
      throw new Error(
        `Customer pack criterion override "${key}" does not match a shared criterion key.`
      );
    }
  }
  if (Object.keys(overrides).length === 0) {
    return bySection;
  }

  const result: Record<string, T[]> = {};
  for (const [section, list] of Object.entries(bySection)) {
    result[section] = list.map((criterion) => {
      const description = overrides[criterion.key];
      return description === undefined
        ? criterion
        : { ...criterion, description };
    });
  }
  return result;
}
