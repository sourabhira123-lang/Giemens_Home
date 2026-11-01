import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Globe2,
  Layers3,
  Network,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  businessAreas,
  companyName,
  futureAreas,
  innovationAreas,
  pageMeta,
} from "./data";
import {
  BusinessCard,
  CTASection,
  PageMeta,
  Reveal,
  SectionHeading,
} from "./components";

const architectureImage =
  "https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1500&q=85";
const cityImage =
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=85";
const technologyImage =
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85";
const workspaceImage =
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=85";

function PageHero({
  eyebrow,
  title,
  description,
  image = cityImage,
  imageAlt = "Contemporary architecture against a deep blue sky",
}: {
  eyebrow: string;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
}) {
  return (
    <section className="page-hero">
      <img className="page-hero-image" src={image} alt={imageAlt} fetchPriority="high" />
      <div className="page-hero-overlay" />
      <div className="container page-hero-content">
        <Reveal>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </Reveal>
      </div>
      <span className="page-hero-index" aria-hidden="true">GIEMENS / {new Date().getFullYear()}</span>
    </section>
  );
}

function ImagePanel({
  src,
  alt,
  label,
}: {
  src: string;
  alt: string;
  label: string;
}) {
  return (
    <div className="image-panel">
      <img src={src} alt={alt} loading="lazy" />
      <div className="image-panel-caption">
        <span className="caption-dot" />
        <span>{label}</span>
        <ArrowUpRight size={17} />
      </div>
    </div>
  );
}

export function HomePage() {
  const reduceMotion = useReducedMotion();
  return (
    <>
      <PageMeta {...pageMeta["/"]} />
      <section className="hero">
        <img
          className="hero-image"
          src={architectureImage}
          alt="Sculptural contemporary building representing connected infrastructure"
          fetchPriority="high"
        />
        <div className="hero-shade" />
        <div className="hero-grid-pattern" aria-hidden="true" />
        <div className="container hero-layout">
          <div className="hero-copy">
            <motion.span
              className="eyebrow"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              A connected enterprise
            </motion.span>
            <motion.h1
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.08 }}
            >
              Engineering solutions.
              <br />
              Empowering businesses.
              <br />
              <span>Building tomorrow.</span>
            </motion.h1>
            <motion.p
              className="hero-description"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.18 }}
            >
              An integrated enterprise delivering technology, legal support,
              compliance, infrastructure, digital transformation and commercial
              solutions through innovation, expertise and strategic execution.
            </motion.p>
            <motion.div
              className="hero-actions"
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.28 }}
            >
              <Link className="button button-primary" to="/businesses">
                Explore our businesses <ArrowRight size={17} />
              </Link>
              <Link className="button button-ghost" to="/contact">
                Connect with us <ArrowDownRight size={17} />
              </Link>
            </motion.div>
            <div className="hero-footnote">
              <span className="hero-footnote-line" />
              <span>Building Trust. Connecting Solutions. Engineering the Future.</span>
            </div>
          </div>
          <Reveal className="hero-orbit">
            <div className="orbit-ring orbit-ring-one" />
            <div className="orbit-ring orbit-ring-two" />
            <div className="orbit-center">
              <Network size={31} strokeWidth={1.3} />
              <span>Connected<br />by design</span>
            </div>
            <div className="orbit-node node-top">Technology</div>
            <div className="orbit-node node-right">Commerce</div>
            <div className="orbit-node node-bottom">Infrastructure</div>
            <div className="orbit-node node-left">Expertise</div>
          </Reveal>
        </div>
        <div className="hero-bottom container">
          <span>01 — 08</span>
          <span>One Enterprise. Multiple Solutions. Infinite Possibilities.</span>
          <span>Scroll to discover <ArrowDownRight size={15} /></span>
        </div>
      </section>

      <section className="section intro-section">
        <div className="container intro-layout">
          <Reveal className="intro-copy">
            <span className="eyebrow">Who we are</span>
            <h2>One enterprise.<br /><span>Multiple possibilities.</span></h2>
            <p className="lead">
              {companyName} is a diversified, technology-driven enterprise
              connecting professional services, infrastructure, commerce and
              innovation.
            </p>
            <p>
              Through specialized brands such as Jurivana, we aim to make
              complex business and regulatory processes more accessible while
              developing practical digital and commercial solutions for people
              and organizations across India and globally.
            </p>
            <Link className="text-link" to="/about">
              Discover our purpose <ArrowRight size={17} />
            </Link>
          </Reveal>
          <Reveal className="intro-visual" delay={0.1}>
            <ImagePanel
              src={workspaceImage}
              alt="Bright collaborative workspace with a view of the city"
              label="A broader view of business"
            />
            <div className="intro-stat">
              <span className="stat-number">08</span>
              <span>Connected<br />business verticals</span>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section business-section" id="businesses">
        <div className="container">
          <SectionHeading
            eyebrow="Our ecosystem"
            title="Explore our business ecosystem"
            description="A diverse portfolio of capabilities, connected by a shared commitment to thoughtful execution and lasting value."
          />
          <div className="business-grid">
            {businessAreas.map((business, index) => (
              <BusinessCard key={business.title} {...business} index={index} />
            ))}
          </div>
          <div className="section-footer-link">
            <Link className="text-link" to="/businesses">
              View the complete ecosystem <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>

      <section className="jurivana-feature">
        <div className="jurivana-image-wrap">
          <img
            src="https://images.unsplash.com/photo-1505664194779-8beaceb93744?auto=format&fit=crop&w=1400&q=85"
            alt="Architectural columns in a formal civic building"
            loading="lazy"
          />
          <div className="jurivana-image-label"><span>Specialized brand</span><strong>JURIVANA</strong></div>
        </div>
        <div className="jurivana-copy">
          <Reveal>
            <span className="eyebrow">Featured brand · Jurivana</span>
            <h2>Simplifying legal.<br />Securing property.<br /><span>Empowering business.</span></h2>
            <p>
              Practical support for documentation, property due diligence and
              business compliance—delivered with clarity, care and a
              technology-aware mindset.
            </p>
            <ul className="check-list">
              <li><Check size={16} /> Legal documentation support</li>
              <li><Check size={16} /> Property verification & due diligence</li>
              <li><Check size={16} /> Business registration assistance</li>
              <li><Check size={16} /> Licensing & compliance support</li>
            </ul>
            <p className="small-note">
              Jurivana provides assistance and information; it is not presented
              as a law firm or a substitute for advice from a qualified
              professional.
            </p>
            <Link className="button button-outline" to="/jurivana">
              Explore Jurivana <ArrowRight size={17} />
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="section why-section">
        <div className="container">
          <SectionHeading
            eyebrow="Why GIEMENS"
            title="A wider lens. A more connected way forward."
            description="We bring complementary capabilities together to help turn complex challenges into considered next steps."
            align="center"
          />
          <div className="why-grid">
            {[
              { icon: Layers3, title: "Integrated business solutions", text: "Multiple capabilities, thoughtfully connected around your goals." },
              { icon: Sparkles, title: "Technology-driven approach", text: "Digital thinking applied with purpose, clarity and practical value." },
              { icon: Globe2, title: "Multiple industry expertise", text: "A broad perspective across business, services and infrastructure." },
              { icon: Target, title: "Customer-centric execution", text: "Every engagement begins by understanding what matters to you." },
              { icon: Workflow, title: "Scalable digital infrastructure", text: "Solutions designed to evolve as needs and opportunities change." },
              { icon: ShieldCheck, title: "Innovation & improvement", text: "Learning, adapting and continuously refining how we work." },
            ].map(({ icon: Icon, title, text }, index) => (
              <Reveal key={title} delay={(index % 3) * 0.05} className="why-card">
                <Icon size={23} strokeWidth={1.6} />
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="technology-band">
        <div className="container technology-layout">
          <Reveal className="technology-copy">
            <span className="eyebrow">Technology & innovation</span>
            <h2>Digital thinking.<br /><span>Real-world momentum.</span></h2>
            <p>
              We explore how emerging technologies and purposeful software can
              simplify operations, unlock insight and create more connected
              experiences.
            </p>
            <Link className="text-link text-link-light" to="/technology">
              Discover our technology vision <ArrowRight size={17} />
            </Link>
          </Reveal>
          <Reveal className="technology-visual" delay={0.1}>
            <img src={technologyImage} alt="Computer circuit board with precise electronic components" loading="lazy" />
            <div className="technology-visual-overlay" />
            <div className="tech-label">INTELLIGENCE<br /><span>MEETS EXECUTION</span></div>
            <div className="technology-tags">
              {innovationAreas.slice(0, 6).map((area) => <span key={area}>{area}</span>)}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section engineering-section">
        <div className="container engineering-layout">
          <Reveal className="engineering-visual">
            <ImagePanel
              src={cityImage}
              alt="High-rise architectural facade reaching into the sky"
              label="Engineering vision into execution"
            />
          </Reveal>
          <Reveal className="engineering-copy" delay={0.1}>
            <span className="eyebrow">Engineering & infrastructure</span>
            <h2>Engineering vision into execution.</h2>
            <p>
              We bring an integrated perspective to engineering consultancy,
              project management and infrastructure support—helping teams
              translate ambition into considered, coordinated work.
            </p>
            <Link className="text-link" to="/engineering">
              Explore engineering capabilities <ArrowRight size={17} />
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="commerce-section">
        <div className="container commerce-layout">
          <Reveal>
            <span className="eyebrow">Commerce & consumer products</span>
            <h2>Thoughtful brands.<br /><span>Connected commerce.</span></h2>
            <p>
              From digital commerce to consumer products, we are building a
              platform for ideas that bring useful, well-considered products
              closer to people.
            </p>
            <Link className="text-link text-link-light" to="/ecommerce">
              Explore commerce & products <ArrowRight size={17} />
            </Link>
          </Reveal>
          <Reveal className="commerce-list" delay={0.1}>
            {["Digital commerce", "Consumer products", "Fragrances & cosmetics", "Private label", "Brand development"].map((item, index) => (
              <div className="commerce-item" key={item}>
                <span>0{index + 1}</span><strong>{item}</strong><ArrowUpRight size={17} />
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="section future-section">
        <div className="container future-layout">
          <Reveal className="future-intro">
            <span className="eyebrow">Future direction</span>
            <h2>Beyond today.<br /><span>Building tomorrow.</span></h2>
            <p>
              Our longer-term vision may extend into adjacent areas as
              capabilities, partnerships and market needs develop. These are
              potential future directions—not a representation that every
              activity is currently operational.
            </p>
          </Reveal>
          <Reveal className="future-tags" delay={0.1}>
            {futureAreas.map((area) => <span key={area}>{area}<ArrowUpRight size={14} /></span>)}
          </Reveal>
        </div>
      </section>

      <CTASection secondaryPath="/services" />
    </>
  );
}

export function AboutPage() {
  return (
    <>
      <PageMeta {...pageMeta["/about"]} />
      <PageHero
        eyebrow="About GIEMENS"
        title="A connected enterprise, built for what comes next."
        description="We bring technology, professional services, infrastructure and commerce together to make complex challenges easier to navigate."
        image={workspaceImage}
        imageAlt="A light-filled modern workspace"
      />
      <section className="section">
        <div className="container split-section">
          <Reveal>
            <span className="eyebrow">Company overview</span>
            <h2>Many disciplines.<br /><span>One shared direction.</span></h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="lead">
              {companyName} is a diversified technology-driven enterprise
              focused on legal, property, compliance, IT solutions, engineering
              services, digital marketing, e-commerce, consumer products and
              business consultancy.
            </p>
            <p>
              Through specialized brands such as Jurivana, we aim to simplify
              complex business and regulatory processes while delivering
              innovative digital and commercial solutions to individuals and
              organizations across India and globally.
            </p>
          </Reveal>
        </div>
      </section>
      <section className="values-section">
        <div className="container values-grid">
          <Reveal className="values-image">
            <img src={architectureImage} alt="Contemporary architectural details" loading="lazy" />
            <span className="values-image-caption">A wider view of what's possible</span>
          </Reveal>
          <div className="values-content">
            <Reveal>
              <span className="eyebrow">Our foundation</span>
              <h2>Purpose with a point of view.</h2>
            </Reveal>
            <Reveal className="principle-row" delay={0.05}>
              <span>01</span><div><h3>Vision</h3><p>To build an integrated and innovative enterprise that connects technology, professional services, infrastructure and commerce to create meaningful opportunities across industries.</p></div>
            </Reveal>
            <Reveal className="principle-row" delay={0.1}>
              <span>02</span><div><h3>Mission</h3><p>To simplify complex business processes and deliver accessible, reliable and technology-driven solutions through innovation, professional execution and customer-focused services.</p></div>
            </Reveal>
            <Reveal className="principle-row" delay={0.15}>
              <span>03</span><div><h3>Our purpose</h3><p>To connect useful expertise and emerging ideas in ways that help people and organizations move forward with greater clarity.</p></div>
            </Reveal>
          </div>
        </div>
      </section>
      <section className="section values-list-section">
        <div className="container">
          <SectionHeading
            eyebrow="How we work"
            title="A business philosophy grounded in trust."
            description="Our values guide how we think, collaborate and deliver across every part of the enterprise."
          />
          <div className="value-pills">
            {["Integrity", "Innovation", "Accountability", "Transparency", "Customer focus", "Excellence", "Continuous learning"].map((value, index) => (
              <Reveal key={value} delay={(index % 4) * 0.04}><span className="value-pill"><Check size={16} />{value}</span></Reveal>
            ))}
          </div>
        </div>
      </section>
      <CTASection />
    </>
  );
}

export function BusinessesPage() {
  return (
    <>
      <PageMeta {...pageMeta["/businesses"]} />
      <PageHero
        eyebrow="Business ecosystem"
        title="One enterprise. Multiple solutions."
        description="Explore a connected portfolio spanning professional services, digital solutions, commerce and infrastructure."
      />
      <section className="section business-section page-business-section">
        <div className="container">
          <SectionHeading
            eyebrow="Eight connected verticals"
            title="Capabilities that work better together."
            description="Each vertical brings a distinct focus to the wider GIEMENS ecosystem."
          />
          <div className="business-grid">
            {businessAreas.map((business, index) => (
              <BusinessCard key={business.title} {...business} index={index} />
            ))}
          </div>
        </div>
      </section>
      <CTASection secondaryPath="/services" />
    </>
  );
}

const serviceDetails = [
  { title: "Legal, property & compliance support", detail: "Documentation assistance, property verification and due diligence, business registration guidance, and licensing and compliance support.", path: "/jurivana" },
  { title: "Technology & digital solutions", detail: "Software development, technology consulting, digital transformation, automation and data-informed solutions.", path: "/technology" },
  { title: "Engineering & infrastructure", detail: "Engineering consultancy, project coordination and infrastructure support tailored to project context.", path: "/engineering" },
  { title: "Digital marketing & media", detail: "Brand strategy, content, search and social media marketing, creative production and campaign planning.", path: "/marketing" },
  { title: "E-commerce & consumer products", detail: "Digital commerce strategy, marketplace enablement, product positioning and brand development.", path: "/ecommerce" },
  { title: "Business consultancy", detail: "Strategic planning, business advisory, operational thinking and management consultancy.", path: "/consultancy" },
];

export function ServicesPage() {
  return (
    <>
      <PageMeta {...pageMeta["/services"]} />
      <PageHero
        eyebrow="What we do"
        title="Practical support for ambitious ideas."
        description="Explore the capabilities we bring together to help organizations navigate change, develop new opportunities and move forward."
      />
      <section className="section services-page">
        <div className="container">
          <SectionHeading
            eyebrow="Service capabilities"
            title="The right expertise for the next step."
            description="Our services span connected disciplines, with scope shaped around each inquiry and engagement."
          />
          <div className="service-list">
            {serviceDetails.map((service, index) => (
              <Reveal className="service-row" key={service.title} delay={(index % 3) * 0.04}>
                <span className="service-number">0{index + 1}</span>
                <div><h3>{service.title}</h3><p>{service.detail}</p></div>
                <Link to={service.path} aria-label={`Learn more about ${service.title}`}><ArrowUpRight size={20} /></Link>
              </Reveal>
            ))}
          </div>
          <p className="small-note service-disclaimer">
            Service availability and scope may vary. Regulated professional
            matters may require engagement with an appropriately qualified and
            authorized professional.
          </p>
        </div>
      </section>
      <CTASection />
    </>
  );
}

const detailedPages: Record<string, {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  overview: string;
  capabilities: string[];
  note?: string;
}> = {
  "/technology": {
    eyebrow: "Technology & innovation",
    title: "Technology that makes progress practical.",
    description: "We explore digital capabilities that help businesses work smarter, operate with confidence and create better connected experiences.",
    image: technologyImage,
    imageAlt: "Detailed circuit board representing digital technology",
    overview: "Our technology vision is focused on practical application: understanding the need first, then applying software, automation and data thoughtfully to create useful outcomes.",
    capabilities: innovationAreas,
  },
  "/ecommerce": {
    eyebrow: "E-commerce & consumer products",
    title: "Building connected commerce experiences.",
    description: "A developing ecosystem for digital commerce, consumer products and brands that connect with modern customers.",
    image: workspaceImage,
    imageAlt: "Modern design studio and collaborative workspace",
    overview: "We bring together digital commerce, product thinking and brand development across B2B, B2C and D2C opportunities. Consumer product areas include fragrances, cosmetics, skincare and private label.",
    capabilities: ["Digital commerce", "B2B, B2C & D2C", "Marketplace & distribution", "Fragrances & cosmetics", "Private-label products", "Brand development"],
  },
  "/engineering": {
    eyebrow: "Engineering & infrastructure",
    title: "Engineering vision into execution.",
    description: "An integrated approach to engineering consultancy, project management and infrastructure support.",
    image: cityImage,
    imageAlt: "Modern high-rise architecture in a city",
    overview: "We aim to support projects with structured thinking, coordinated execution and a clear view of the wider infrastructure context—from early planning through delivery support.",
    capabilities: ["Engineering consultancy", "Project management support", "Infrastructure planning", "Technical coordination", "Digital tools for delivery", "Cross-functional collaboration"],
  },
  "/marketing": {
    eyebrow: "Digital marketing & media",
    title: "Make your next story matter.",
    description: "Brand, content and digital campaign capabilities to help organizations reach the right audiences with greater clarity.",
    image: workspaceImage,
    imageAlt: "Creative team workspace for collaboration and content planning",
    overview: "From strategic positioning to ongoing digital communication, we bring creative and analytical thinking together to help brands show up consistently and communicate with purpose.",
    capabilities: ["Search engine optimization", "Social media marketing", "Digital advertising", "Content strategy", "Video & creative production", "Brand identity"],
  },
  "/consultancy": {
    eyebrow: "Business consultancy",
    title: "Clearer thinking for what comes next.",
    description: "Business advisory and strategic planning for organizations working through opportunity, complexity and change.",
    image: architectureImage,
    imageAlt: "Modern building with a confident geometric form",
    overview: "Good advice starts with listening. We work to understand the situation, clarify priorities and shape a practical path forward—grounded in the needs and capacity of each organization.",
    capabilities: ["Strategic planning", "Business advisory", "Management consultancy", "Growth and operating models", "Process improvement", "Business research"],
  },
};

export function DetailPage({ path }: { path: string }) {
  const content = detailedPages[path];
  if (!content) return null;
  const meta = pageMeta[path];
  return (
    <>
      <PageMeta {...meta} />
      <PageHero
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
        image={content.image}
        imageAlt={content.imageAlt}
      />
      <section className="section detail-overview">
        <div className="container detail-overview-grid">
          <Reveal>
            <span className="eyebrow">Our perspective</span>
            <h2>Thoughtful expertise.<br /><span>Connected execution.</span></h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="lead">{content.overview}</p>
            <p>We shape each conversation around the goals, constraints and context that matter to the organization—bringing the most relevant capabilities together.</p>
          </Reveal>
        </div>
      </section>
      <section className="capabilities-section">
        <div className="container">
          <SectionHeading
            eyebrow="Areas of focus"
            title="Capabilities for a changing landscape."
            description="A view of the disciplines and opportunities connected to this part of our ecosystem."
            light
          />
          <div className="capability-grid">
            {content.capabilities.map((capability, index) => (
              <Reveal className="capability-item" key={capability} delay={(index % 4) * 0.04}>
                <span>0{index + 1}</span><strong>{capability}</strong><ArrowUpRight size={16} />
              </Reveal>
            ))}
          </div>
          {content.note && <p className="capability-note">{content.note}</p>}
        </div>
      </section>
      <CTASection secondaryPath="/businesses" />
    </>
  );
}

export function JurivanaPage() {
  const services = [
    "Legal documentation support",
    "Property verification",
    "Property due diligence",
    "Property documentation",
    "Business registration assistance",
    "Licensing and certification support",
    "Corporate compliance support",
    "Regulatory process assistance",
  ];
  return (
    <>
      <PageMeta {...pageMeta["/jurivana"]} />
      <PageHero
        eyebrow="A GIEMENS specialized brand"
        title="Simplifying legal. Securing property. Empowering business."
        description="Jurivana helps people and organizations navigate documentation, property due diligence and business compliance processes with greater clarity."
        image="https://images.unsplash.com/photo-1505664194779-8beaceb93744?auto=format&fit=crop&w=1600&q=85"
        imageAlt="Formal architectural columns in a civic building"
      />
      <section className="section jurivana-intro">
        <div className="container detail-overview-grid">
          <Reveal>
            <span className="eyebrow">Clarity for complex processes</span>
            <h2>Support to help you take the next step.</h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="lead">
              Jurivana is a specialized brand within the GIEMENS ecosystem,
              focused on making legal-adjacent, property and compliance
              processes easier to understand and navigate.
            </p>
            <p>
              Assistance is administrative and informational in nature unless
              otherwise stated. For legal opinions, representation or regulated
              professional advice, consult a qualified and authorized
              professional.
            </p>
          </Reveal>
        </div>
      </section>
      <section className="capabilities-section">
        <div className="container">
          <SectionHeading
            eyebrow="Jurivana support"
            title="Practical assistance, with clarity at every step."
            description="A focused set of support areas for individuals and organizations managing essential documentation and compliance processes."
            light
          />
          <div className="capability-grid">
            {services.map((service, index) => (
              <Reveal className="capability-item" key={service} delay={(index % 4) * 0.04}>
                <span>0{index + 1}</span><strong>{service}</strong><ArrowUpRight size={16} />
              </Reveal>
            ))}
          </div>
          <div className="jurivana-disclaimer">
            <ShieldCheck size={20} />
            <p>
              <strong>Important:</strong> Jurivana is not represented here as a
              law firm and does not claim to provide legal representation.
              Service scope and availability depend on the specific matter.
            </p>
          </div>
        </div>
      </section>
      <CTASection title="Need help navigating a process?" description="Tell us what you are working through. Our team can help identify the right next conversation." secondaryPath="/services" />
    </>
  );
}

export function CareersPage() {
  return (
    <>
      <PageMeta {...pageMeta["/careers"]} />
      <PageHero
        eyebrow="Careers at GIEMENS"
        title="Build meaningful work with a broader perspective."
        description="We are bringing together people who care about solving problems, learning continuously and creating useful outcomes."
        image={workspaceImage}
        imageAlt="Collaborative modern workplace"
      />
      <section className="section careers-section">
        <div className="container careers-layout">
          <Reveal>
            <span className="eyebrow">Grow with us</span>
            <h2>Curiosity, accountability<br /><span>and a spirit of possibility.</span></h2>
            <p>
              Our business spans different disciplines and perspectives. As
              opportunities develop, we hope to work with thoughtful people who
              bring integrity, initiative and a willingness to learn.
            </p>
            <p className="careers-status"><span /> No specific vacancies are listed at this time.</p>
            <Link className="button button-primary" to="/contact">
              Start a conversation <ArrowRight size={17} />
            </Link>
            <p className="small-note">For a careers inquiry, select “Other” and include “Careers” in the subject. Submitting the form requires an active contact integration.</p>
          </Reveal>
          <Reveal className="careers-values" delay={0.1}>
            {["Integrity in how we work", "Learning across disciplines", "Ownership and accountability", "Ideas that create practical value"].map((value, index) => (
              <div key={value}><span>0{index + 1}</span><strong>{value}</strong><ArrowUpRight size={17} /></div>
            ))}
          </Reveal>
        </div>
      </section>
      <CTASection secondaryPath="/about" />
    </>
  );
}

const legalContent: Record<string, { heading: string; lead: string; sections: { title: string; text: string }[] }> = {
  "/privacy-policy": {
    heading: "Privacy policy",
    lead: "This notice explains how this website is designed to handle information you choose to provide. It should be reviewed and completed for the applicable jurisdiction and actual operating practices before publication.",
    sections: [
      { title: "Information you provide", text: "The contact form requests your name, email address, optional phone number and organization, inquiry category, subject and message. The form does not transmit submissions until a contact endpoint is configured. When connected, the receiving organization and its service providers may process the information to respond to your inquiry." },
      { title: "Purpose and retention", text: "Information submitted through an enabled contact channel should be used to address the inquiry and retained only as long as needed for that purpose or as required by applicable obligations. Retention periods and the responsible data controller should be confirmed before the form is activated." },
      { title: "Cookies and third parties", text: "This website does not intentionally set analytics or advertising cookies. Some visual assets are loaded from third-party image hosting and may result in a request to that provider. Review and update this statement if analytics, embedded services or additional tracking are introduced." },
      { title: "Your choices and questions", text: "For requests concerning information submitted through an enabled contact channel, use the same channel through which you made the inquiry. A verified privacy contact address has not been provided on this website." },
    ],
  },
  "/terms": {
    heading: "Terms & conditions",
    lead: "By using this website, you agree to use its content for lawful, informational purposes. These terms are a general website notice and should be reviewed for the company's jurisdiction and operating model before publication.",
    sections: [
      { title: "Website content", text: "Content is provided for general information and may change without notice. Reasonable care is taken in its preparation, but no guarantee is made that every item is complete, current or suitable for a particular purpose." },
      { title: "No professional engagement", text: "Viewing this website or sending an inquiry does not create a client, advisory, agency or professional relationship. Any engagement is subject to separate scope, terms and authorization." },
      { title: "Third-party services", text: "Links and externally hosted images may be provided for convenience or presentation. GIEMENS does not control and is not responsible for third-party websites, content or privacy practices." },
      { title: "Use and availability", text: "You agree not to misuse the website or interfere with its operation. The website may be updated, suspended or changed as services and capabilities evolve." },
    ],
  },
  "/disclaimer": {
    heading: "Disclaimer",
    lead: "The information on this website describes a diversified enterprise and its areas of focus. It is not a promise that every listed activity or service is currently available in every location.",
    sections: [
      { title: "Professional and regulated services", text: "Information about legal, property, compliance, engineering, financial or other regulated matters is general in nature and does not constitute a professional opinion, legal advice, certification or representation. Consult an appropriately qualified and authorized professional for advice on a specific matter." },
      { title: "Jurivana", text: "Jurivana is described as a support brand for documentation, property due diligence and business compliance processes. It is not represented as a law firm, and no licensed legal representation is implied." },
      { title: "Future areas", text: "FinTech, PropTech, LegalTech, international trade, startup incubation and other future-direction references describe potential expansion areas only. They are not claims of currently operational products or services." },
      { title: "No guarantees", text: "Examples, descriptions and forward-looking statements are illustrative. Outcomes depend on individual circumstances, scope and applicable requirements; no result is guaranteed." },
    ],
  },
};

export function LegalPage({ path }: { path: string }) {
  const content = legalContent[path];
  if (!content) return null;
  return (
    <>
      <PageMeta {...pageMeta[path]} />
      <PageHero
        eyebrow="Website information"
        title={content.heading}
        description={content.lead}
        image={architectureImage}
        imageAlt="Contemporary building exterior"
      />
      <section className="section legal-section">
        <div className="container legal-content">
          <p className="legal-updated">General website information · {companyName}</p>
          {content.sections.map((section, index) => (
            <Reveal key={section.title} className="legal-item" delay={(index % 2) * 0.04}>
              <span>0{index + 1}</span>
              <div><h2>{section.title}</h2><p>{section.text}</p></div>
            </Reveal>
          ))}
          <p className="small-note">
            These pages are informational website copy, not a substitute for
            jurisdiction-specific legal review. No official address or
            contact details have been published because none were provided.
          </p>
        </div>
      </section>
      <CTASection title="Questions about this website?" secondaryPath="/about" />
    </>
  );
}

export function ContactPage() {
  return (
    <>
      <PageMeta {...pageMeta["/contact"]} />
      <PageHero
        eyebrow="Contact GIEMENS"
        title="Let's start with a conversation."
        description="Tell us a little about what you are looking to achieve. We will use your inquiry to understand the right next step."
        image={workspaceImage}
        imageAlt="Inviting modern meeting space"
      />
      <section className="section contact-section">
        <div className="container contact-layout">
          <Reveal className="contact-intro">
            <span className="eyebrow">Get in touch</span>
            <h2>Every meaningful collaboration starts somewhere.</h2>
            <p>
              Share your question or opportunity using the form. No office
              address, phone number or email address has been supplied for
              publication.
            </p>
            <div className="contact-note">
              <Globe2 size={19} />
              <p>Working across connected business disciplines, with a perspective that reaches beyond borders.</p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <ContactForm />
          </Reveal>
        </div>
      </section>
    </>
  );
}

function ContactForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    if (String(data.get("website") ?? "").trim()) {
      setMessage("Your inquiry could not be submitted. Please try again.");
      setStatus("error");
      return;
    }

    const phone = String(data.get("phone") ?? "").trim();
    const normalizedPhone = phone.replace(/[\s().-]/g, "");
    if (phone && !/^\+?[1-9]\d{6,14}$/.test(normalizedPhone)) {
      setMessage("Enter a valid international phone number, including the country code.");
      setStatus("error");
      return;
    }

    const endpoint = import.meta.env.VITE_CONTACT_ENDPOINT || "/api/contact";
    setStatus("loading");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: data.get("fullName"),
          email: data.get("email"),
          phone: normalizedPhone || undefined,
          organization: data.get("organization"),
          category: data.get("category"),
          subject: data.get("subject"),
          message: data.get("message"),
          website: data.get("website"),
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        console.error("Contact endpoint returned a non-JSON response:", {
          endpoint,
          status: response.status,
          contentType,
        });
        setStatus("error");
        setMessage(
          "The contact service is unavailable in this preview. For local testing, start the app with `npx vercel dev` and configure the required email and rate-limit environment variables.",
        );
        return;
      }
      let result: unknown;
      try {
        result = await response.json();
      } catch {
        result = undefined;
      }
      const responseBody =
        typeof result === "object" && result !== null
          ? (result as { ok?: unknown; error?: unknown })
          : undefined;
      if (response.status !== 200 || responseBody?.ok !== true) {
        setStatus("error");
        setMessage(
          (typeof responseBody?.error === "string" && responseBody.error) ||
            "We could not submit your inquiry right now. Please try again later.",
        );
        return;
      }
      form.reset();
      setStatus("success");
      setMessage("Your inquiry has been submitted. Thank you for getting in touch.");
    } catch (error) {
      console.error("Contact form submission failed:", error);
      setStatus("error");
      setMessage("We could not submit your inquiry right now. Please try again later.");
    }
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          Full name <span>*</span>
          <input type="text" name="fullName" autoComplete="name" required maxLength={120} />
        </label>
        <label>
          Email address <span>*</span>
          <input type="email" name="email" autoComplete="email" required maxLength={254} />
        </label>
        <label>
          Phone number
          <input type="tel" name="phone" autoComplete="tel" placeholder="+91 98765 43210" maxLength={24} />
        </label>
        <label>
          Company / organization
          <input type="text" name="organization" autoComplete="organization" maxLength={160} />
        </label>
        <label>
          Inquiry category <span>*</span>
          <select name="category" defaultValue="" required>
            <option value="" disabled>Select a category</option>
            {[
              "General Inquiry",
              "Legal, Property & Compliance",
              "Technology Solutions",
              "E-Commerce",
              "Digital Marketing",
              "Engineering & Infrastructure",
              "Business Consultancy",
              "Partnership",
              "Other",
            ].map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label>
          Subject <span>*</span>
          <input type="text" name="subject" required maxLength={180} />
        </label>
        <label className="form-full">
          Message <span>*</span>
          <textarea name="message" rows={5} required minLength={10} maxLength={5000} />
        </label>
      </div>
      <label className="honeypot" aria-hidden="true">
        Leave this field empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <p className="form-consent">
        Please do not include sensitive personal information in your message.
        See our <Link to="/privacy-policy">privacy policy</Link>.
      </p>
      <button className="button button-primary form-submit" type="submit" disabled={status === "loading"}>
        {status === "loading" ? "Submitting…" : "Send inquiry"}
        {status === "loading" ? <span className="spinner" aria-hidden="true" /> : <ArrowRight size={17} />}
      </button>
      <p className={`form-status form-status-${status}`} role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
