import { useState } from "react";
import { toast } from "sonner";
import { Link } from "@/lib/router-compat";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SiteShell, { PageHero, Section, Reveal } from "@/components/site/SiteShell";
import { C } from "@/components/site/siteTheme";
import { CTA_START, SIGNUP_URL, trackCta } from "@/components/site/cta";

const PLANNED = [
  { t: "Practice circles", d: "Small, invite only rooms where CAs compare how they handle the same filing edge case." },
  { t: "Monthly GST clinic", d: "One hour, live, on the notices and mismatches that actually landed that month." },
  { t: "Owner office hours", d: "Founders and finance leads working through a real cash question with a CFO in the room." },
  { t: "Playbook library", d: "The chaser scripts, close checklists and review templates our users already run." },
];

export default function CommunityPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    const { error } = await (supabase.from("early_access_requests") as any).insert({
      email: email.trim(),
      module: "community",
      user_id: null,
    });
    if (error) toast.error(error.message);
    else {
      setSubmitted(true);
      toast.success("You are on the community list");
    }
  };

  return (
    <SiteShell>
      <PageHero
        center
        kicker="Community"
        title="A room for the people who"
        italic="close the books"
        sub="We are building the FynHelp community deliberately and slowly, so the first hundred members set the tone. Leave your email and you will be in the first intake."
        actions={<span className="fh-soon">Coming soon</span>}
      />

      <Section center>
        <Reveal>
          <form
            onSubmit={handleWaitlist}
            className="fh-capture"
            style={{ marginInline: "auto", maxWidth: 460 }}
          >
            {submitted ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  justifyContent: "center",
                  padding: "14px 18px",
                  fontSize: 14,
                  color: C.green,
                  fontWeight: 600,
                }}
              >
                <Check size={16} /> You are on the list. We will write before we open.
              </div>
            ) : (
              <>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  aria-label="Email address"
                />
                <button type="submit" className="fh-btn fh-btn-primary">
                  Request an invite
                </button>
              </>
            )}
          </form>
        </Reveal>
        <p className="fh-note" style={{ textAlign: "center" }}>
          No newsletter. One email when the doors open.
        </p>
      </Section>

      <Section
        alt
        kicker="What we are planning"
        title="Four things, done properly,"
        italic="rather than a busy forum"
      >
        <div className="fh-grid fh-g2" style={{ marginTop: 40 }}>
          {PLANNED.map((p, i) => (
            <Reveal key={p.t} delay={(i % 2) * 90}>
              <div className="fh-card">
                <span className="fh-tag">Planned</span>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section center kicker="In the meantime" title="The product is" italic="already running">
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 26 }}>
          <Link to={SIGNUP_URL} className="fh-btn fh-btn-primary" onClick={() => trackCta("start", "community")}>{CTA_START}</Link>
          <Link to="/blog" className="fh-btn fh-btn-ghost">Read the blog</Link>
        </div>
      </Section>
    </SiteShell>
  );
}
