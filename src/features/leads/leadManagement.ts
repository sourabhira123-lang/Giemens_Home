import {
  businessDivisions,
  type BusinessDivision,
  type Lead,
} from "./model.ts";

const categoryDivisions: Record<string, BusinessDivision> = {
  "Legal, Property & Compliance": "Jurivana",
  "Technology Solutions": "Technology",
  "E-Commerce": "Commerce",
  "Digital Marketing": "Commerce",
  "Engineering & Infrastructure": "Engineering",
  "Business Consultancy": "Consulting",
};

const divisionCategories: Partial<Record<BusinessDivision, string>> = {
  Jurivana: "Legal, Property & Compliance",
  Technology: "Technology Solutions",
  Engineering: "Engineering & Infrastructure",
  Commerce: "E-Commerce",
  Consulting: "Business Consultancy",
  Academy: "Other",
  Corporate: "General Inquiry",
};

export function resolveBusinessDivision(value: string | null): BusinessDivision | undefined {
  return businessDivisions.find((division) => division === value);
}

export function getBusinessDivision(
  category: string,
  preferredDivision?: BusinessDivision,
): BusinessDivision {
  return preferredDivision ?? categoryDivisions[category] ?? "Corporate";
}

export function getCategoryForDivision(division: BusinessDivision): string {
  return divisionCategories[division] ?? "General Inquiry";
}

export function getLeadMetrics(leads: Lead[]) {
  return {
    total: leads.length,
    new: leads.filter((lead) => lead.status === "NEW").length,
    qualified: leads.filter((lead) => lead.status === "QUALIFIED").length,
    recent: [...leads]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 5),
  };
}

export function sortLeadsByCreatedAt(leads: Lead[]): Lead[] {
  return [...leads].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export function formatLeadDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
