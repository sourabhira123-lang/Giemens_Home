import { motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Footer, Navbar, PageMeta } from "./components";
import {
  AboutPage,
  BusinessesPage,
  CareersPage,
  ContactPage,
  DetailPage,
  HomePage,
  JurivanaPage,
  LegalPage,
  ServicesPage,
} from "./pages";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function NotFoundPage() {
  return (
    <section className="not-found-section">
      <PageMeta title="Page not found | GIEMENS" description="The page you requested could not be found." />
      <div className="container">
        <span className="eyebrow">404 · Page not found</span>
        <h1>This path doesn't lead anywhere.</h1>
        <p>The page may have moved. Explore the GIEMENS ecosystem or return to the homepage.</p>
        <a className="button button-primary" href="/">Back to homepage</a>
      </div>
    </section>
  );
}

function ApplicationRoutes() {
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={pathname}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/businesses" element={<BusinessesPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/jurivana" element={<JurivanaPage />} />
        <Route path="/technology" element={<DetailPage path="/technology" />} />
        <Route path="/ecommerce" element={<DetailPage path="/ecommerce" />} />
        <Route path="/engineering" element={<DetailPage path="/engineering" />} />
        <Route path="/marketing" element={<DetailPage path="/marketing" />} />
        <Route path="/consultancy" element={<DetailPage path="/consultancy" />} />
        <Route path="/careers" element={<CareersPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy-policy" element={<LegalPage path="/privacy-policy" />} />
        <Route path="/terms" element={<LegalPage path="/terms" />} />
        <Route path="/disclaimer" element={<LegalPage path="/disclaimer" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </motion.div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Navbar />
      <main>
        <ApplicationRoutes />
      </main>
      <Footer />
    </>
  );
}
