export type EcosystemStatus = "planned" | "in_review" | "active";

export type EcosystemCapability = {
  title: string;
  description: string;
};

export type FutureIntegration = {
  name: string;
  purpose: string;
  endpoint: string;
  status: EcosystemStatus;
};
