import { useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { CA } from "./portalUi";

interface Props {
  step: 1 | 2 | 3 | 4;
  firmId: string;
  firstClientId?: string | null;
}

const STEPS = [
  { n: 1, label: "Add your first client" },
  { n: 2, label: "Upload a document" },
  { n: 3, label: "Review the extraction" },
  { n: 4, label: "Generate MIS" },
];

export function CAOnboardingBanner({ step, firstClientId }: Props) {
  const navigate = useNavigate();

  useEffect(() => {
    console.log(`[fyn:onboarding] step=${step} isFirstRun=true`);
  }, [step]);

  const configs: Record<
    1 | 2 | 3 | 4,
    { title: string; body: string; action: string; path: string; tip: string }
  > = {
    1: {
      title: "Add your first client to get started",
      body: "The portal is ready. Add a client entity, a business you manage, and you can start uploading their bank statements and documents immediately. Takes under two minutes.",
      action: "Add first client",
      path: "/ca/clients/add",
      tip: "Tip: you can add subsidiaries to a client later. Start with the main entity.",
    },
    2: {
      title: "Upload a bank statement or invoice",
      body: "Upload a bank statement in CSV or PDF, or any invoice for this client. The system reads it, classifies it, and extracts every transaction automatically. High confidence items post straight to the ledger.",
      action: "Go to Intake",
      path: "/ca/intake/inbox",
      tip: "Tip: HDFC, ICICI, SBI, Axis and Kotak statement formats are all supported. Start with a bank statement.",
    },
    3: {
      title: "Review the extracted items",
      body: "Some items need a quick check before posting. Open the Review queue to see what was extracted, correct any values if needed, and post them to the ledger. This is your first reconcilable dataset.",
      action: "Go to Review queue",
      path: "/ca/intake/review",
      tip: "Tip: items the system is confident about post automatically. Only ambiguous ones come to you.",
    },
    4: {
      title: "You are ready to reconcile and generate MIS",
      body: "Your first document is posted to the ledger. Open the client workspace, run reconciliation, and generate your first MIS report.",
      action: firstClientId ? "Open client workspace" : "Go to Clients",
      path: firstClientId ? `/ca/clients/${firstClientId}` : "/ca/clients",
      tip: "Tip: run reconciliation first, it matches bank lines to invoices automatically.",
    },
  };

  const config = configs[step];

  return (
    <div
      style={{
        background: "linear-gradient(135deg, rgba(169,56,56,0.06) 0%, rgba(139,105,20,0.04) 100%)",
        border: "1px solid rgba(169,56,56,0.20)",
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {STEPS.map((s) => (
          <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background: s.n < step ? "#1F5A46" : s.n === step ? "#A93838" : "rgba(23,18,8,0.10)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: CA.mono,
                fontSize: 10,
                fontWeight: 700,
                color: s.n <= step ? "#F7F1E6" : "rgba(23,18,8,0.35)",
                flexShrink: 0,
              }}
            >
              {String(s.n)}
            </div>
            <span
              style={{
                fontFamily: CA.sans,
                fontSize: 11,
                fontWeight: s.n === step ? 700 : 400,
                color: s.n === step ? "#171208" : "rgba(23,18,8,0.38)",
              }}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: CA.serif, fontSize: 18, fontWeight: 700, color: "#171208", marginBottom: 8 }}>
        {config.title}
      </div>
      <p
        style={{
          fontFamily: CA.sans,
          fontSize: 13.5,
          lineHeight: 1.65,
          color: "rgba(23,18,8,0.68)",
          marginBottom: 16,
          maxWidth: 580,
        }}
      >
        {config.body}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button
          onClick={() => navigate(config.path)}
          style={{
            background: "#A93838",
            color: "#F7F1E6",
            border: "none",
            borderRadius: 10,
            padding: "10px 20px",
            fontFamily: CA.sans,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(169,56,56,0.25)",
          }}
        >
          {config.action}
        </button>
        <span style={{ fontFamily: CA.sans, fontSize: 12, color: "rgba(23,18,8,0.45)", fontStyle: "italic" }}>
          {config.tip}
        </span>
      </div>
    </div>
  );
}
