const dialCodesByTimezone: Record<string, string> = {
  "Asia/Calcutta": "+91",
  "Asia/Dubai": "+971",
  "Asia/Kolkata": "+91",
  "Asia/Singapore": "+65",
  "Australia/Sydney": "+61",
  "Europe/London": "+44",
  "America/Chicago": "+1",
  "America/Los_Angeles": "+1",
  "America/New_York": "+1",
};

export function detectDialCodeFromTimezone(
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string | undefined {
  return dialCodesByTimezone[timeZone];
}

export function getDefaultDialCode(
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  return detectDialCodeFromTimezone(timeZone) ?? "+91";
}