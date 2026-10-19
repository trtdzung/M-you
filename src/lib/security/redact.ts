// Conservative counterpart of guardrails.py; the agent applies that masker again before LLM use.
export function redactSecurityText(text: string): string {
  return text
    .replace(/\b(?:\d[ -]?){9,19}\b/g, "[đã ẩn]")
    .replace(/((?:otp|cvv|cvc|mã\s*pin)\b[^\d\n]{0,20})\d{3,8}\b/gi, "$1[đã ẩn]")
    .replace(/((?:mật\s*khẩu|mat\s*khau|password|passcode)\s*(?:của\s+tôi\s*)?(?:là|la|:|=)\s*)(?!\[đã ẩn\])\S+/gi, "$1[đã ẩn]");
}
