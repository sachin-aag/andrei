export const VOICE_LANGUAGE_AUTO = "auto";
export const VOICE_LANGUAGE_STORAGE_KEY = "voiceInputLanguage:v1";

export function voiceInputLanguageLabel(code: string): string {
  switch (code) {
    case "en-US":
    case "en-IN":
      return "English";
    case "hi-IN":
      return "हिन्दी";
    case "mr-IN":
      return "मराठी";
    case VOICE_LANGUAGE_AUTO:
      return "Automatic";
    default:
      return code;
  }
}

export function readStoredVoiceLanguage(allowed: readonly string[]): string {
  try {
    const raw = localStorage.getItem(VOICE_LANGUAGE_STORAGE_KEY);
    if (raw === VOICE_LANGUAGE_AUTO) return VOICE_LANGUAGE_AUTO;
    if (raw && allowed.includes(raw)) return raw;
  } catch {
    /* private mode / SSR */
  }
  return allowed.length > 1
    ? VOICE_LANGUAGE_AUTO
    : (allowed[0] ?? VOICE_LANGUAGE_AUTO);
}

export function writeStoredVoiceLanguage(code: string): void {
  try {
    localStorage.setItem(VOICE_LANGUAGE_STORAGE_KEY, code);
  } catch {
    /* ignore quota / private mode */
  }
}

export function languageCodesForPreference(
  preference: string,
  allowed: readonly string[]
): readonly string[] {
  if (preference !== VOICE_LANGUAGE_AUTO && allowed.includes(preference)) {
    return [preference];
  }
  return allowed;
}

/** Drop codes the pack does not enable; empty / invalid → pack default. */
export function resolveVoiceLanguageCodes(
  requested: unknown,
  allowed: readonly string[]
): readonly string[] {
  if (!Array.isArray(requested) || requested.length === 0) {
    return allowed;
  }
  const codes = requested.filter(
    (code): code is string => typeof code === "string" && allowed.includes(code)
  );
  return codes.length > 0 ? codes : allowed;
}
