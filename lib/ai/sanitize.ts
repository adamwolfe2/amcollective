/**
 * Prompt injection sanitization utility.
 * Applied to all user-controlled input before it reaches any AI agent.
 */

const INJECTION_PATTERNS = [
  /forget\s+your\s+instructions/gi,
  /ignore\s+(your\s+)?(previous\s+)?instructions/gi,
  /you\s+are\s+now\s+/gi,
  /act\s+as\s+(a\s+|an\s+)?/gi,
  /system\s+prompt/gi,
  /jailbreak/gi,
  /disregard\s+(all\s+)?previous/gi,
  /override\s+(your\s+)?/gi,
  /\[SYSTEM\]/gi,
  /\[INST\]/gi,
];

export function sanitizeUserInput(message: string, maxLength = 10000): string {
  let sanitized = message.slice(0, maxLength);
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[filtered]");
  }
  return sanitized;
}
