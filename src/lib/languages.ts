// ISO 639-1 codes for the languages we let users select.
// Ordered roughly by global speaker count; easy to extend.
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "zh", label: "Mandarin Chinese" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "ja", label: "Japanese" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ko", label: "Korean" },
  { code: "it", label: "Italian" },
  { code: "tr", label: "Turkish" },
  { code: "vi", label: "Vietnamese" },
  { code: "pl", label: "Polish" },
  { code: "uk", label: "Ukrainian" },
  { code: "fa", label: "Persian" },
  { code: "nl", label: "Dutch" },
  { code: "id", label: "Indonesian" },
  { code: "bn", label: "Bengali" },
  { code: "ur", label: "Urdu" },
  { code: "tl", label: "Tagalog" },
  { code: "th", label: "Thai" },
  { code: "ro", label: "Romanian" },
  { code: "el", label: "Greek" },
  { code: "he", label: "Hebrew" },
  { code: "cs", label: "Czech" },
  { code: "sv", label: "Swedish" },
  { code: "hu", label: "Hungarian" },
  { code: "bg", label: "Bulgarian" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.label]),
);

const VALID_CODES = new Set<string>(LANGUAGES.map((l) => l.code));

export function getLanguageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

export function isValidLanguageCode(code: string): boolean {
  return VALID_CODES.has(code);
}

export function filterValidLanguages(codes: string[]): string[] {
  return codes.filter(isValidLanguageCode);
}
