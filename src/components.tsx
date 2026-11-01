import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { businessAreas, companyName } from "./data";

const dropdownLinks = [
  { label: "Business ecosystem", path: "/businesses" },
  ...businessAreas.map(({ title, path }) => ({ label: title, path })),
];

export function PageMeta({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  useEffect(() => {
    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", "website");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta(
      "property",
      "og:image",
      "https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1200&h=630&q=85",
    );
    setMeta(
      "name",
      "twitter:image",
      "https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1200&h=630&q=85",
    );

    const siteUrl = import.meta.env.VITE_SITE_URL;
    if (siteUrl) {
      const canonicalUrl = new URL(window.location.pathname, siteUrl).href;
      setCanonical(canonicalUrl);
      setMeta("property", "og:url", canonicalUrl);
    } else {
      document.querySelector('link[rel="canonical"]')?.remove();
      document.querySelector('meta[property="og:url"]')?.remove();
    }
  }, [title, description]);

  return null;
}

function setMeta(attribute: "name" | "property", key: string, value: string) {
  let element = document.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = value;
}

function setCanonical(url: string) {
  let element = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = url;
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [businessMenuOpen, setBusinessMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const updateScroll = () => setScrolled(window.scrollY > 24);
    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setBusinessMenuOpen(false);
  }, [location.pathname]);

  const closeMenus = () => {
    setMobileOpen(false);
    setBusinessMenuOpen(false);
  };

  return (
    <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
      <nav className="nav-shell container" aria-label="Main navigation">
        <Link className="brand-lockup" to="/" aria-label="GIEMENS home" onClick={closeMenus}>
          <img className="company-logo" src="/giemens-logo.png" alt="GIEMENS logo" />
          <span className="brand-name">
            <strong>GIEMENS</strong>
            <small>GLOBAL INFRASTRUCTURE · TECHNOLOGY</small>
          </span>
        </Link>

        <button
          className="menu-toggle"
          type="button"
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileOpen}
          aria-controls="primary-navigation"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <div
          className={`nav-content ${mobileOpen ? "nav-content-open" : ""}`}
          id="primary-navigation"
        >
          <div className="nav-links">
            <Link to="/" onClick={closeMenus}>Home</Link>
            <Link to="/about" onClick={closeMenus}>About Us</Link>
            <div className={`nav-dropdown ${businessMenuOpen ? "dropdown-open" : ""}`}>
              <button
                className="nav-dropdown-trigger"
                type="button"
                aria-expanded={businessMenuOpen}
                aria-controls="business-menu"
                onClick={() => setBusinessMenuOpen((open) => !open)}
              >
                Businesses <ChevronDown size={14} />
              </button>
              <div className="dropdown-panel" id="business-menu">
                {dropdownLinks.map((item) => (
                  <Link key={`${item.label}-${item.path}`} to={item.path} onClick={closeMenus}>
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <Link to="/services" onClick={closeMenus}>Services</Link>
            <Link to="/jurivana" onClick={closeMenus}>Brands</Link>
            <Link to="/careers" onClick={closeMenus}>Careers</Link>
          </div>
          <Link className="button button-small button-outline nav-cta" to="/contact" onClick={closeMenus}>
            Contact Us <ArrowDownRight size={15} />
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div className="footer-about">
          <Link className="brand-lockup" to="/" aria-label="GIEMENS home">
            <img className="company-logo" src="/giemens-logo.png" alt="GIEMENS logo" />
            <span className="brand-name">
              <strong>GIEMENS</strong>
              <small>GLOBAL INFRASTRUCTURE · TECHNOLOGY</small>
            </span>
          </Link>
          <p>
            {companyName} is a diversified enterprise connecting technology,
            professional services, infrastructure, commerce and innovation.
          </p>
          <span className="footer-tagline">Building Trust. Connecting Solutions. Engineering the Future.</span>
        </div>
        <div className="footer-column">
          <h2>Explore</h2>
          <Link to="/about">About us</Link>
          <Link to="/businesses">Businesses</Link>
          <Link to="/services">Services</Link>
          <Link to="/careers">Careers</Link>
        </div>
        <div className="footer-column">
          <h2>Our ecosystem</h2>
          <Link to="/jurivana">Jurivana</Link>
          <Link to="/technology">Technology</Link>
          <Link to="/ecommerce">E-commerce</Link>
          <Link to="/engineering">Engineering</Link>
          <Link to="/marketing">Digital marketing</Link>
          <Link to="/consultancy">Consultancy</Link>
        </div>
        <div className="footer-column">
          <h2>Information</h2>
          <Link to="/contact">Contact</Link>
          <Link to="/privacy-policy">Privacy policy</Link>
          <Link to="/terms">Terms & conditions</Link>
          <Link to="/disclaimer">Disclaimer</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} GIEMENS. All rights reserved.</span>
        <span>One Enterprise. Multiple Solutions. Infinite Possibilities.</span>
      </div>
    </footer>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  light = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  light?: boolean;
}) {
  return (
    <div className={`section-heading ${align === "center" ? "text-center" : ""} ${light ? "heading-light" : ""}`}>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 22 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function BusinessCard({
  title,
  description,
  path,
  icon: Icon,
  index = 0,
}: {
  title: string;
  description: string;
  path: string;
  icon: (typeof businessAreas)[number]["icon"];
  index?: number;
}) {
  return (
    <Reveal delay={(index % 4) * 0.05} className="business-card-wrap">
      <article className="business-card">
        <span className="business-icon"><Icon size={22} strokeWidth={1.7} /></span>
        <span className="card-index">0{index + 1}</span>
        <h3>{title}</h3>
        <p>{description}</p>
        <Link className="text-link" to={path} aria-label={`Explore ${title}`}>
          Explore <ArrowRight size={16} />
        </Link>
      </article>
    </Reveal>
  );
}

export function CTASection({
  title = "Let's build something meaningful together.",
  description = "Bring us your next challenge. Let's explore how connected thinking can move it forward.",
  secondaryPath = "/businesses",
}: {
  title?: string;
  description?: string;
  secondaryPath?: string;
}) {
  return (
    <section className="cta-section">
      <div className="container cta-inner">
        <Reveal className="cta-copy">
          <span className="eyebrow">Start a conversation</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </Reveal>
        <Reveal className="cta-actions" delay={0.1}>
          <Link className="button button-light" to="/contact">
            Contact our team <ArrowRight size={17} />
          </Link>
          <Link className="button button-ghost" to={secondaryPath}>
            Explore our services
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
