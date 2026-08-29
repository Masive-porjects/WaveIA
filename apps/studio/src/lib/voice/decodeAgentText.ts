const UTF8_PERCENT_SEQUENCE = /%(?:C[2-3]%[89AB][0-9A-F]|E[0-9A-F]%[89AB][0-9A-F]%[89AB][0-9A-F])/i;

/**
 * Gemini occasionally returns user-facing copy as percent-encoded UTF-8.
 * Decode only when a multibyte UTF-8 sequence is present, so ordinary text
 * containing percentages or URL fragments remains untouched.
 */
export function decodeAgentText(value: string): string {
  const normalized = value
    // Tolerate the truncated opening punctuation observed in model output.
    .replace(/%C%(BF|A1)/gi, "%C2%$1");

  if (!UTF8_PERCENT_SEQUENCE.test(normalized)) return value;

  try {
    return decodeURIComponent(normalized);
  } catch {
    return value;
  }
}
