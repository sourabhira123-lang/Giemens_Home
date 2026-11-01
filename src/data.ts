import {
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  Code2,
  Gem,
  GraduationCap,
  Scale,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import pageMetadata from "./page-meta.json";

export type Business = {
  title: string;
  description: string;
  path: string;
  icon: LucideIcon;
};

export const companyName =
  "Global Infrastructure Engineering Management Envision Network Solution Technology Private Limited";

export const businessAreas: Business[] = [
  {
    title: "Legal, Property & Compliance",
    description:
      "Practical documentation, property due diligence and business compliance support through the Jurivana brand.",
    path: "/jurivana",
    icon: Scale,
  },
  {
    title: "Information Technology & Digital Solutions",
    description:
      "Software, AI, automation, SaaS and cybersecurity solutions designed around real business needs.",
    path: "/technology",
    icon: Code2,
  },
  {
    title: "E-Commerce & Online Marketplace",
    description:
      "Digital commerce, distribution and marketplace capabilities across B2B, B2C and D2C models.",
    path: "/ecommerce",
    icon: Gem,
  },
  {
    title: "Perfume, Cosmetics & Lifestyle",
    description:
      "A consumer-products vision spanning fragrances, skincare, cosmetics and private-label development.",
    path: "/ecommerce",
    icon: Sparkles,
  },
  {
    title: "Digital Marketing & Media",
    description:
      "Brand building, content, SEO, social media and digital campaigns that help businesses connect.",
    path: "/marketing",
    icon: ChartNoAxesCombined,
  },
  {
    title: "Engineering & Infrastructure",
    description:
      "Engineering consultancy, project management and infrastructure support for ambitious projects.",
    path: "/engineering",
    icon: Building2,
  },
  {
    title: "Training & Professional Development",
    description:
      "Professional learning and skills development designed to help people and organizations grow.",
    path: "/services",
    icon: GraduationCap,
  },
  {
    title: "Business Consultancy",
    description:
      "Strategic planning, business advisory and management consultancy for evolving organizations.",
    path: "/consultancy",
    icon: BriefcaseBusiness,
  },
];

export const pageMeta: Record<string, { title: string; description: string }> =
  pageMetadata;

export const innovationAreas = [
  "Artificial Intelligence",
  "Business Automation",
  "Cloud Solutions",
  "Software Development",
  "SaaS Platforms",
  "Data Analytics",
  "Cybersecurity",
  "Digital Transformation",
];

export const futureAreas = [
  "FinTech",
  "PropTech",
  "LegalTech",
  "Compliance Technology",
  "International Trade",
  "Business Intelligence",
  "Startup Incubation",
  "Franchise Networks",
  "HR & Recruitment",
  "Smart Cities",
  "Sustainability",
];
