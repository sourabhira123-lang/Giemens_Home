import type { ContactInquiry } from "./contact-validation.ts";

export type EmailTemplate = {
  subject: string;
  text: string;
};

type ContactEmailContext = {
  source?: string;
  submittedAt?: Date;
};

function formatDate(date: Date): string {
  return date.toISOString();
}

export function buildContactNotificationEmail(
  inquiry: ContactInquiry,
  context: ContactEmailContext = {},
): EmailTemplate {
  return {
    subject: "[GIEMENS] New Contact Inquiry",
    text: [
      "New contact inquiry received.",
      "",
      `Name: ${inquiry.fullName}`,
      `Email: ${inquiry.email}`,
      `Phone: ${inquiry.phone ?? "Not provided"}`,
      `Organization: ${inquiry.organization ?? "Not provided"}`,
      `Category: ${inquiry.category}`,
      `Subject: ${inquiry.subject}`,
      "",
      "Message:",
      inquiry.message,
      "",
      `Date: ${formatDate(context.submittedAt ?? new Date())}`,
      `Source: ${context.source ?? inquiry.source ?? "website_contact_form"}`,
    ].join("\n"),
  };
}

export function buildContactAutoReplyEmail(
  inquiry: ContactInquiry,
  submittedAt = new Date(),
): EmailTemplate {
  return {
    subject: "Thank you for contacting GIEMENS",
    text: [
      `Hello ${inquiry.fullName},`,
      "",
      "Thank you for contacting GIEMENS Technology Pvt Ltd.",
      "",
      "We have successfully received your inquiry and appreciate your interest.",
      "",
      "Inquiry Details",
      "",
      `Subject: ${inquiry.subject}`,
      `Category: ${inquiry.category}`,
      `Submitted: ${formatDate(submittedAt)}`,
      "",
      "What happens next?",
      "",
      "- Our team will review your inquiry.",
      "- We will contact you if additional information is required.",
      "- A response will be provided as soon as possible.",
      "",
      "For general inquiries:",
      "info@giemens.com",
      "",
      "Website:",
      "https://giemens.com",
      "",
      "Regards,",
      "",
      "GIEMENS Technology Pvt Ltd",
      "Global Infrastructure | Technology",
    ].join("\n"),
  };
}