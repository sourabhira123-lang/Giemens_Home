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
  id?: string;
  title: string;
  description: string;
  path: string;
  href?: string;
  icon: LucideIcon;
};

export const companyName =
  "Global Infrastructure Engineering Management Envision Network Solution Technology Private Limited";

export const ecosystemRoutes = {
  jurivana: "/ecosystem/jurivana",
  technology: "/ecosystem/technology",
  commerce: "/ecosystem/commerce",
  academy: "/ecosystem/academy",
  consulting: "/ecosystem/consulting",
  ecommerce: "/ecosystem/ecommerce",
  marketing: "/ecosystem/marketing",
  engineering: "/ecosystem/engineering",
  consultancy: "/ecosystem/consultancy",
} as const;

export const businessAreas: Business[] = [
  {
    id: "jurivana",
    title: "Legal, Property & Compliance",
    description:
      "Practical documentation, property due diligence and business compliance support through the Jurivana brand.",
    path: ecosystemRoutes.jurivana,
    href: ecosystemRoutes.jurivana,
    icon: Scale,
  },
  {
    title: "Information Technology & Digital Solutions",
    description:
      "Software, AI, automation, SaaS and cybersecurity solutions designed around real business needs.",
    path: ecosystemRoutes.technology,
    icon: Code2,
  },
  {
    title: "E-Commerce & Online Marketplace",
    description:
      "Digital commerce, distribution and marketplace capabilities across B2B, B2C and D2C models.",
    path: ecosystemRoutes.commerce,
    icon: Gem,
  },
  {
    title: "Perfume, Cosmetics & Lifestyle",
    description:
      "A consumer-products vision spanning fragrances, skincare, cosmetics and private-label development.",
    path: ecosystemRoutes.commerce,
    icon: Sparkles,
  },
  {
    title: "Digital Marketing & Media",
    description:
      "Brand building, content, SEO, social media and digital campaigns that help businesses connect.",
    path: ecosystemRoutes.commerce,
    icon: ChartNoAxesCombined,
  },
  {
    title: "Engineering & Infrastructure",
    description:
      "Engineering consultancy, project management and infrastructure support for ambitious projects.",
    path: ecosystemRoutes.engineering,
    icon: Building2,
  },
  {
    title: "Training & Professional Development",
    description:
      "Professional learning and skills development designed to help people and organizations grow.",
    path: ecosystemRoutes.academy,
    icon: GraduationCap,
  },
  {
    title: "Business Consultancy",
    description:
      "Strategic planning, business advisory and management consultancy for evolving organizations.",
    path: ecosystemRoutes.consulting,
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
