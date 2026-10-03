import { Link } from "@/lib/router-compat";
import { Check, ArrowRight } from "lucide-react";
import SiteShell, { PageHero, Section, CtaBand, Reveal } from "@/components/site/SiteShell";
import { AGENTS, agentBySlug } from "@/components/site/agents";
import { C } from "@/components/site/siteTheme";
import { CTA_DEMO, CTA_START, SIGNUP_URL, trackCta } from "@/components/site/cta";
import { DemoLink } from "@/components/site/BookDemo";

export default function AgentPage({ slug }: { slug: string }) {
  const agent = agentBySlug(slug);

  if (!agent) {
    return (
      <SiteShell>
        <PageHero
          kicker="Module not found"
          title="That module does not"
          italic="exist yet"
          sub="Browse the four modules that ship with FynHelp today."
          actions={
            <Link to="/use-cases" className="fh-btn fh-btn-primary">
              See all modules
            </Link>
          }
        />
      </SiteShell>
    );
  }

  const others = AGENTS.filter((a) => a.slug !== agent.slug).slice(0, 3);

  return (
    <SiteShell>
      <PageHero
        kicker={`${agent.kicker} · ${agent.name}`}
        title={agent.headline}
        italic={agent.italic}
        sub={agent.sub}
        actions={
          <>
            <Link to={SIGNUP_URL} className="fh-btn fh-btn-primary" onClick={() => trackCta("start", "agent-hero")}>
              {CTA_START} <ArrowRight size={15} />
            </Link>
            <DemoLink location="agent-hero" className="fh-btn fh-btn-ghost">
              {CTA_DEMO}
            </DemoLink>
          </>
        }
      />

      <div className="fh-wrap">
        <div className="fh-strip">
          <div className="fh-strip-grid">
            {agent.stats.map(([v, l]) => (
              <div key={l}>
                <div className="v num">{v}</div>
                <div className="l">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Section
        kicker="What it handles"
        title="Three jobs it does"
        italic="every single month"
        lead="Not dashboards for their own sake. Each one ends in a decision someone would otherwise take late."
      >
        <div className="fh-grid fh-g3" style={{ marginTop: 44 }}>
          {agent.useCases.map((u, i) => (
            <Reveal key={u.t} delay={i * 80}>
              <div className="fh-card">
                <span className="fh-tag">{String(i + 1).padStart(2, "0")}</span>
                <h3>{u.t}</h3>
                <p>{u.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section alt kicker="Inputs and outputs" title="What goes in," italic="what comes out">
        <div className="fh-split2" style={{ marginTop: 40 }}>
          <Reveal>
            <div className="fh-card">
              <h3>It reads</h3>
              <ul className="fh-list">
                {agent.inputs.map((x) => (
                  <li key={x}>
                    <Check size={15} />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
              <p className="fh-note">
                Connect through Tally, a bank statement upload, or a document drop. Nothing needs to be
                re entered.
              </p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="fh-card">
              <h3>It produces</h3>
              <ul className="fh-list">
                {agent.outputs.map((x) => (
                  <li key={x}>
                    <Check size={15} />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
              <p className="fh-note">
                Every figure stays linked to the source line, so a reviewer can trace it without asking
                anyone.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section kicker="Other modules" title="Works alongside" italic="the rest of the pipeline">
        <div className="fh-grid fh-g3" style={{ marginTop: 40 }}>
          {others.map((a, i) => (
            <Reveal key={a.slug} delay={i * 80}>
              <Link to={`/agents/${a.slug}`} className="fh-card" style={{ display: "block", color: "inherit" }}>
                <span className="fh-tag">{a.kicker}</span>
                <h3>{a.name}</h3>
                <p>{a.sub.split(".")[0]}.</p>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.maroon }}>Read more</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <CtaBand
        title={`Put the ${agent.name.toLowerCase()}`}
        italic="on your books"
        lead="Thirty minutes with your own data. You keep whatever it finds, whether or not you continue."
        location="agent-final"
      />
    </SiteShell>
  );
}
