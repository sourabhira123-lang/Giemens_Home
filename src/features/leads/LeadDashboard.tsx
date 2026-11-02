import { PageMeta, SectionHeading } from "../../components";
import { pageMeta } from "../../data";

export function LeadDashboard() {
  return (
    <>
      <PageMeta {...pageMeta["/admin/leads"]} />
      <section className="section lead-dashboard">
        <div className="container">
          <SectionHeading
            eyebrow="Lead management"
            title="Website inquiries"
            description="Lead records are stored centrally and require administrator access."
          />
          <p className="lead-storage-notice" role="note">
            Lead records and status updates are unavailable until administrator
            authentication is configured. No lead information is stored in this
            browser or exposed through the public API.
          </p>
        </div>
      </section>
    </>
  );
}
