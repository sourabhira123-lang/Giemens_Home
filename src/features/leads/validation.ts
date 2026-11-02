import {
  businessDivisions,
  leadStatuses,
  type LeadSubmission,
  type NewLead,
} from "./model.ts";

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const e164Pattern = /^\+[1-9]\d{6,14}$/;
const forbiddenControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export class LeadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadValidationError";
  }
}

function readText(
  value: unknown,
  field: string,
  maxLength: number,
  required = false,
): string {
  if (value === undefined || value === null) {
    if (required) throw new LeadValidationError(`${field} is required.`);
    return "";
  }
  if (typeof value !== "string") throw new LeadValidationError(`${field} is invalid.`);

  const normalized = value.trim();
  if (
    normalized.length > maxLength ||
    forbiddenControls.test(normalized) ||
    (field !== "Message" && /[\r\n\t]/.test(normalized)) ||
    (required && normalized.length === 0)
  ) {
    throw new LeadValidationError(`${field} is invalid.`);
  }
  return normalized;
}

export function validateLeadSubmission(input: LeadSubmission): NewLead {
  const name = readText(input.name, "Name", 120, true);
  const email = readText(input.email, "Email", 254, true);
  const phone = readText(input.phone, "Phone", 24);
  const company = readText(input.company, "Company", 160);
  const message = readText(input.message, "Message", 5000, true);
  const source = readText(input.source, "Source", 100, true);
  const subject = readText(input.subject, "Subject", 180, true);
  const category = readText(input.category, "Category", 80, true);

  if (name.length < 2) throw new LeadValidationError("Enter a valid name.");
  if (!emailPattern.test(email)) throw new LeadValidationError("Enter a valid email address.");
  if (message.length < 10) throw new LeadValidationError("Message must be at least 10 characters.");
  if (!businessDivisions.includes(input.businessDivision as (typeof businessDivisions)[number])) {
    throw new LeadValidationError("Select a valid business division.");
  }
  if (
    input.id !== undefined &&
    (typeof input.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id))
  ) {
    throw new LeadValidationError("Submission identifier is invalid.");
  }
  if (phone) {
    const normalizedPhone = phone.replace(/[\s().-]/g, "");
    if (!e164Pattern.test(normalizedPhone)) {
      throw new LeadValidationError("Enter a valid international phone number, including the country code.");
    }
    return {
      id: input.id ?? crypto.randomUUID(),
      name,
      email,
      phone: normalizedPhone,
      ...(company ? { company } : {}),
      businessDivision: input.businessDivision as NewLead["businessDivision"],
      message,
      source,
      subject,
      category,
    };
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    name,
    email,
    ...(company ? { company } : {}),
    businessDivision: input.businessDivision as NewLead["businessDivision"],
    message,
    source,
    subject,
    category,
  };
}

export function isLeadStatus(value: unknown): value is NewLead["status"] {
  return leadStatuses.includes(value as (typeof leadStatuses)[number]);
}
