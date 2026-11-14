export const inquiryCategories = [
  "General Inquiry",
  "Legal, Property & Compliance",
  "Technology Solutions",
  "E-Commerce",
  "Digital Marketing",
  "Engineering & Infrastructure",
  "Business Consultancy",
  "Partnership",
  "Other",
] as const;

export type ContactInquiry = {
  fullName: string;
  email: string;
  phone?: string;
  organization?: string;
  category: (typeof inquiryCategories)[number];
  subject: string;
  message: string;
  source?: string;
};

export type ContactValidationResult =
  | { ok: true; value: ContactInquiry; honeypotFilled: boolean }
  | { ok: false; error: string };

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const e164Pattern = /^\+[1-9]\d{6,14}$/;
const forbiddenControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function readText(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
  required = false,
): string | undefined | null {
  const value = input[key];
  if (value === undefined || value === null) {
    return required ? "" : undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (
    normalized.length > maxLength ||
    forbiddenControls.test(normalized) ||
    (key !== "message" && /[\r\n\t]/.test(normalized)) ||
    (required && normalized.length === 0)
  ) {
    return null;
  }
  return normalized;
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && emailPattern.test(value);
}

export function validateContactPayload(
  body: unknown,
): ContactValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Submit a valid contact inquiry." };
  }

  const input = body as Record<string, unknown>;
  const fullName = readText(input, "fullName", 120, true);
  const email = readText(input, "email", 254, true);
  const phone = readText(input, "phone", 24);
  const organization = readText(input, "organization", 160);
  const category = readText(input, "category", 80, true);
  const subject = readText(input, "subject", 180, true);
  const message = readText(input, "message", 5000, true);
  const source = readText(input, "source", 100);
  const website = input.website;

  if (
    fullName === undefined ||
    fullName === null ||
    fullName.length < 2 ||
    email === undefined ||
    email === null ||
    !isValidEmail(email) ||
    phone === undefined ||
    phone === null ||
    organization === undefined ||
    organization === null ||
    category === undefined ||
    category === null ||
    !inquiryCategories.includes(category as (typeof inquiryCategories)[number]) ||
    subject === undefined ||
    subject === null ||
    message === undefined ||
    message === null ||
    source === null ||
    message.length < 10 ||
    (website !== undefined && typeof website !== "string")
  ) {
    return { ok: false, error: "Check the inquiry details and try again." };
  }

  const normalizedPhone = phone ? phone.replace(/[\s().-]/g, "") : "";
  if (normalizedPhone && !e164Pattern.test(normalizedPhone)) {
    return {
      ok: false,
      error: "Enter a valid international phone number, including the country code.",
    };
  }

  return {
    ok: true,
    value: {
      fullName,
      email,
      ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      ...(organization ? { organization } : {}),
      category: category as ContactInquiry["category"],
      subject,
      message,
      ...(source ? { source } : {}),
    },
    honeypotFilled: typeof website === "string" && website.trim().length > 0,
  };
}
