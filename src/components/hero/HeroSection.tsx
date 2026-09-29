import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@/lib/router-compat"
import {
  Shield, TrendingUp, TrendingDown, AlertTriangle, FileText,
  BarChart2, Activity, IndianRupee, Building2, Clock,
  Zap, Bell, Download, Play, ChevronRight, ArrowRight,
  RefreshCw, CheckCircle, Calendar, Users, PieChart,
  Mail, Database, Lock, Cpu, Sparkles, Send
} from "lucide-react"

const BRAND = {
  ink: "#171208",
  red: "#C41E1E",
  beige: "#F4EDDA",
  gold: "#8B6914",
  green: "#1F5A46",
  warn: "#F59E0B",
  muted: "rgba(244,237,218,0.38)",
  mutedBorder: "rgba(244,237,218,0.07)",
}

const CONVERSATIONS = [
  {
    user: "What is my runway this month?",
    label: "LIQUIDITY ANALYSIS",
    reply: (
      <>
        At current burn, you have{" "}
        <strong style={{ color: "#F4EDDA" }}>8.4 months runway</strong>.
        Cutting vendor Infra-X (₹40K/mo overpriced by 34%) extends this to{" "}
        <strong style={{ color: "#1F5A46" }}>9.7 months</strong>. Cash position is stable.
      </>
    ),
    actions: [
      { label: "Export Report", icon: <FileText size={10} />, color: "#1F5A46", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.22)" },
      { label: "Set Alert", icon: <Bell size={10} />, color: "#8B6914", bg: "rgba(139,105,20,0.1)", border: "rgba(139,105,20,0.22)" },
      { label: "Run Scenario", icon: <Play size={10} />, color: "#C41E1E", bg: "rgba(196,30,30,0.1)", border: "rgba(196,30,30,0.22)" },
    ],
  },
  {
    user: "What-If I hire 2 engineers now?",
    label: "SCENARIO MODEL",
    reply: (
      <>
        Adding ₹2.4L/mo reduces runway from 8.4 →{" "}
        <strong style={{ color: "#F59E0B" }}>5.8 months</strong>. Revenue needs{" "}
        <strong style={{ color: "#F4EDDA" }}>+18% growth</strong> to stay safe. Recommend waiting 60 days until MRR hits ₹5.2L.
      </>
    ),
    actions: [
      { label: "Model This", icon: <BarChart2 size={10} />, color: "#8B6914", bg: "rgba(139,105,20,0.1)", border: "rgba(139,105,20,0.22)" },
      { label: "PDF Report", icon: <Download size={10} />, color: "#1F5A46", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.22)" },
      { label: "View Forecast", icon: <TrendingUp size={10} />, color: "#C41E1E", bg: "rgba(196,30,30,0.1)", border: "rgba(196,30,30,0.22)" },
    ],
  },
  {
    user: "Is my GST filing on track?",
    label: "GST INTELLIGENCE",
    reply: (
      <>
        <span style={{ color: "#1F5A46" }}>GSTR-1 filed</span> · GSTR-3B due in{" "}
        <strong style={{ color: "#F59E0B" }}>3 days</strong>. ITC reconciliation shows{" "}
        <strong style={{ color: "#F4EDDA" }}>₹18K gap</strong> vs 2A. Recommend filing by tomorrow to avoid interest.
      </>
    ),
    actions: [
      { label: "View ITC Gap", icon: <AlertTriangle size={10} />, color: "#C41E1E", bg: "rgba(196,30,30,0.1)", border: "rgba(196,30,30,0.22)" },
      { label: "File Now", icon: <CheckCircle size={10} />, color: "#1F5A46", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.22)" },
      { label: "Get Report", icon: <FileText size={10} />, color: "#8B6914", bg: "rgba(139,105,20,0.1)", border: "rgba(139,105,20,0.22)" },
    ],
  },
  {
    user: "Can I extend vendor credit terms?",
    label: "CASH FLOW STRATEGY",
    reply: (
      <>
        Moving Infra-X to{" "}
        <strong style={{ color: "#F4EDDA" }}>60-day terms</strong> frees ₹80K working capital, covering 67 days of new hire cost. Vendor risk score:{" "}
        <strong style={{ color: "#1F5A46" }}>LOW</strong>. Recommend negotiating now.
      </>
    ),
    actions: [
      { label: "Draft Email", icon: <Mail size={10} />, color: "#8B6914", bg: "rgba(139,105,20,0.1)", border: "rgba(139,105,20,0.22)" },
      { label: "Cash Report", icon: <Activity size={10} />, color: "#1F5A46", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.22)" },
      { label: "Set Reminder", icon: <Calendar size={10} />, color: "#C41E1E", bg: "rgba(196,30,30,0.1)", border: "rgba(196,30,30,0.22)" },
    ],
  },
]

const BRANDS = [
  { name: "Razorpay", abbr: "RP", color: "#2B73FF" },
  { name: "Zoho Books", abbr: "ZB", color: "#C41E1E" },
  { name: "HDFC Bank", abbr: "HD", color: "#004C8F" },
  { name: "ICICI Bank", abbr: "IC", color: "#F58220" },
  { name: "SBI", abbr: "SB", color: "#22409A" },
  { name: "Axis Bank", abbr: "AX", color: "#97144D" },
  { name: "Kotak", abbr: "KT", color: "#ED1C24" },
  { name: "Tally", abbr: "TL", color: "#0066CC" },
  { name: "Stripe", abbr: "ST", color: "#635BFF" },
  { name: "PayU", abbr: "PU", color: "#FF6B00" },
  { name: "GST Portal", abbr: "GS", color: "#0A6B4B" },
  { name: "QuickBooks", abbr: "QB", color: "#2CA01C" },
]

const SKEUOMORPHIC_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Instrument+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;600&display=swap');

  .fyn-hero-root { font-family: 'Instrument Sans', sans-serif; background: #171208; position: relative; overflow: hidden; color: #F4EDDA; }

  .fyn-bg-texture { position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(244,237,218,0.012) 2px, rgba(244,237,218,0.012) 3px),
      repeating-linear-gradient(90deg, transparent, transparent 48px, rgba(244,237,218,0.018) 48px, rgba(244,237,218,0.018) 49px),
      repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(244,237,218,0.008) 8px, rgba(244,237,218,0.008) 9px);
  }
  .fyn-bg-vignette { position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(ellipse at 50% 0%, rgba(196,30,30,0.08) 0%, transparent 55%),
      radial-gradient(ellipse at 0% 60%, rgba(196,30,30,0.06) 0%, transparent 45%),
      radial-gradient(ellipse at 100% 40%, rgba(139,105,20,0.06) 0%, transparent 45%),
      radial-gradient(ellipse at 50% 100%, rgba(139,105,20,0.05) 0%, transparent 50%);
    animation: fyn-breathe 12s ease-in-out infinite;
  }
  .fyn-bg-grid { position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background-image: linear-gradient(rgba(244,237,218,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(244,237,218,0.025) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: radial-gradient(ellipse at 50% 50%, black 30%, transparent 80%);
    -webkit-mask-image: radial-gradient(ellipse at 50% 50%, black 30%, transparent 80%);
  }
  .fyn-orb { position: absolute; border-radius: 50%; pointer-events: none; filter: blur(60px); z-index: 0; }
  .fyn-orb-1 { width: 400px; height: 400px; top: -100px; left: -100px; background: radial-gradient(circle, rgba(196,30,30,0.12), transparent 70%); animation: fyn-orb-drift1 15s ease-in-out infinite; }
  .fyn-orb-2 { width: 350px; height: 350px; top: 50%; right: -80px; background: radial-gradient(circle, rgba(139,105,20,0.1), transparent 70%); animation: fyn-orb-drift2 18s ease-in-out infinite; }
  .fyn-orb-3 { width: 280px; height: 280px; bottom: -60px; left: 40%; background: radial-gradient(circle, rgba(196,30,30,0.07), transparent 70%); animation: fyn-orb-drift3 20s ease-in-out infinite; }

  @keyframes fyn-breathe { 0%,100% { opacity: 0.7 } 50% { opacity: 1 } }
  @keyframes fyn-orb-drift1 { 0%,100% { transform: translate(0,0) scale(1) } 33% { transform: translate(30px,20px) scale(1.05) } 66% { transform: translate(-20px,40px) scale(0.95) } }
  @keyframes fyn-orb-drift2 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-40px,-30px) scale(1.08) } }
  @keyframes fyn-orb-drift3 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(20px,-20px) } }

  .fyn-panel-3d { background: #0F0804; border: 1px solid rgba(244,237,218,0.08); border-radius: 18px; overflow: hidden; position: relative;
    box-shadow: -24px 24px 72px rgba(0,0,0,0.7), -5px 0 0 rgba(196,30,30,0.06), inset 0 1px 0 rgba(244,237,218,0.06), inset 0 -1px 0 rgba(0,0,0,0.3), inset 1px 0 0 rgba(244,237,218,0.04);
    animation: fyn-panel-float 8s ease-in-out infinite;
    background-image: linear-gradient(to bottom, rgba(244,237,218,0.04) 0px, transparent 40px);
  }
  @keyframes fyn-panel-float {
    0%,100% { transform: perspective(1400px) rotateY(-4deg) rotateX(1deg) translateY(0px); }
    50% { transform: perspective(1400px) rotateY(-3deg) rotateX(1.5deg) translateY(-6px); }
  }


  .fyn-scan { position: absolute; left: 0; right: 0; height: 60px;
    background: linear-gradient(180deg, transparent 0%, rgba(196,30,30,0.04) 40%, rgba(196,30,30,0.04) 60%, transparent 100%);
    pointer-events: none; z-index: 1; animation: fyn-scan-move 5s linear infinite;
  }
  @keyframes fyn-scan-move { 0% { top: -5% } 100% { top: 105% } }

  .fyn-eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px;
    background: rgba(196,30,30,0.08); border: 1px solid rgba(196,30,30,0.18); border-radius: 100px;
    box-shadow: inset 0 1px 0 rgba(244,237,218,0.06), 0 2px 8px rgba(0,0,0,0.3);
    margin-bottom: 24px; animation: fyn-fade-up 0.5s ease 0.1s both;
    font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: 0.14em; color: #F4EDDA;
  }

  .fyn-pulse-dot { position: relative; width: 7px; height: 7px; }
  .fyn-pulse-dot::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background: #C41E1E; animation: fyn-dot-ping 2s ease-out infinite; }
  .fyn-pulse-dot::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: #C41E1E; z-index: 1; }
  @keyframes fyn-dot-ping { 0% { transform: scale(1); opacity: 1 } 100% { transform: scale(2.4); opacity: 0 } }

  .fyn-red-highlight { display: block; font-family: 'Instrument Sans', sans-serif; font-size: 20px; font-weight: 600; line-height: 1.45; color: #C41E1E;
    padding: 12px 18px; background: rgba(196,30,30,0.06); border-left: 3px solid #C41E1E; border-radius: 0 10px 10px 0; margin: 10px 0;
    box-shadow: inset 0 1px 0 rgba(196,30,30,0.12), inset 0 -1px 0 rgba(0,0,0,0.2), inset 3px 0 0 rgba(196,30,30,0.4);
  }

  .fyn-btn-primary { padding: 13px 28px; background: #C41E1E; border: none; border-radius: 10px;
    font-family: 'Instrument Sans', sans-serif; font-size: 14px; font-weight: 600; color: #F4EDDA;
    cursor: pointer; position: relative; overflow: hidden;
    box-shadow: 0 4px 0 #8B1414, 0 6px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15);
    transition: all 0.15s ease; display: inline-flex; align-items: center; gap: 8px;
  }
  .fyn-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 5px 0 #8B1414, 0 8px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15); }
  .fyn-btn-primary:active { transform: translateY(2px); box-shadow: 0 2px 0 #8B1414, 0 3px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1); }

  .fyn-btn-ghost { padding: 13px 20px; background: rgba(244,237,218,0.04); border: 1px solid rgba(244,237,218,0.1);
    border-radius: 10px; font-family: 'Instrument Sans', sans-serif; font-size: 14px; color: rgba(244,237,218,0.7); cursor: pointer;
    display: inline-flex; align-items: center; gap: 7px; box-shadow: inset 0 1px 0 rgba(244,237,218,0.05); transition: all 0.15s ease;
  }
  .fyn-btn-ghost:hover { background: rgba(244,237,218,0.07); color: #F4EDDA; border-color: rgba(244,237,218,0.18); }

  .fyn-action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 7px;
    font-family: 'Instrument Sans', sans-serif; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap;
    transition: all 0.15s ease; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 3px rgba(0,0,0,0.3);
    animation: fyn-actions-in 0.3s ease both;
  }
  .fyn-action-btn:hover { transform: translateY(-1px); }

  .fyn-chat-user { display: flex; justify-content: flex-end; margin-bottom: 10px; animation: fyn-slide-right 0.35s ease both; }
  .fyn-chat-user-bubble { padding: 10px 14px; background: rgba(244,237,218,0.08); border: 1px solid rgba(244,237,218,0.12);
    border-radius: 11px 11px 2px 11px; font-size: 14.5px; font-weight: 500; color: #F4EDDA; max-width: 82%; line-height: 1.45;
    box-shadow: inset 0 1px 0 rgba(244,237,218,0.06);
  }
  .fyn-chat-fynny { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; animation: fyn-slide-left 0.35s ease both; }
  .fyn-chat-avatar { width: 28px; height: 28px; border-radius: 7px; background: rgba(196,30,30,0.15); border: 1px solid rgba(196,30,30,0.28);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; color: #F4858A;
    box-shadow: inset 0 1px 0 rgba(196,30,30,0.18), 0 2px 6px rgba(0,0,0,0.3);
  }
  .fyn-chat-fynny-bubble { padding: 12px 15px; background: rgba(196,30,30,0.1); border: 1px solid rgba(196,30,30,0.2);
    border-radius: 2px 11px 11px 11px; font-size: 14px; color: #F4EDDA; line-height: 1.6; max-width: 88%;
    box-shadow: inset 0 1px 0 rgba(196,30,30,0.1);
  }
  .fyn-chat-label { display: block; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; color: #F4858A; margin-bottom: 6px; letter-spacing: 0.12em; }


  .fyn-stat-card { padding: 12px 14px; background: rgba(244,237,218,0.03); border: 1px solid rgba(244,237,218,0.06); border-radius: 10px;
    box-shadow: inset 0 1px 0 rgba(244,237,218,0.05), inset 0 -1px 0 rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.25);
  }

  .fyn-ticker { overflow: hidden; background: rgba(244,237,218,0.025); border-top: 1px solid rgba(244,237,218,0.05); border-bottom: 1px solid rgba(244,237,218,0.05);
    padding: 9px 0; box-shadow: inset 0 1px 3px rgba(0,0,0,0.3), inset 0 -1px 3px rgba(0,0,0,0.2);
  }
  .fyn-ticker-inner { white-space: nowrap; display: inline-block; animation: fyn-ticker-scroll 22s linear infinite; }
  @keyframes fyn-ticker-scroll { 0% { transform: translateX(0) } 100% { transform: translateX(-50%) } }

  .fyn-conn-wrap { background: #FFFFFF; border-radius: 14px; padding: 20px 22px; overflow: hidden;
    box-shadow: 0 4px 0 rgba(0,0,0,0.25), 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -2px 0 rgba(0,0,0,0.08);
  }
  .fyn-logo-track { white-space: nowrap; display: inline-flex; gap: 10px; align-items: center; animation: fyn-logo-scroll 26s linear infinite; }
  @keyframes fyn-logo-scroll { 0% { transform: translateX(0) } 100% { transform: translateX(-50%) } }
  .fyn-logo-pill { display: inline-flex; align-items: center; gap: 9px; padding: 9px 14px; border-radius: 10px; flex-shrink: 0; background: #FAFAF8;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8); transition: transform 0.15s ease;
  }
  .fyn-logo-pill:hover { transform: translateY(-1px); }
  .fyn-logo-abbr { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
    background: #171208; color: #F4EDDA; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.4);
  }
  .fyn-logo-name { font-family: 'Instrument Sans', sans-serif; font-size: 12.5px; font-weight: 600; color: #171208; white-space: nowrap; }
  .fyn-logo-status { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #1F5A46; display: flex; align-items: center; gap: 3px; margin-top: 1px; }

  @keyframes fyn-fade-up { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes fyn-slide-left { from { opacity: 0; transform: translateX(-8px) } to { opacity: 1; transform: translateX(0) } }
  @keyframes fyn-slide-right { from { opacity: 0; transform: translateX(8px) } to { opacity: 1; transform: translateX(0) } }
  @keyframes fyn-actions-in { from { opacity: 0; transform: translateY(5px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes fyn-blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }

  .fyn-nav-link { font-family: 'Instrument Sans', sans-serif; font-size: 13.5px; color: rgba(244,237,218,0.65); text-decoration: none; transition: color 0.15s ease; }
  .fyn-nav-link:hover { color: #F4EDDA; }
`

export default function HeroSection() {
  const navigate = useNavigate()
  const [chatIdx, setChatIdx] = useState(0)
  const [chatPhase, setChatPhase] = useState<"user" | "fynny" | "actions">("user")
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const phases: Array<"user" | "fynny" | "actions"> = ["user", "fynny", "actions"]
    let p = 0
    const step = () => {
      p++
      if (p < phases.length) {
        setChatPhase(phases[p])
        setTimeout(step, p === 1 ? 900 : 600)
      }
    }
    setChatPhase("user")
    const t = setTimeout(step, 600)
    return () => clearTimeout(t)
  }, [chatIdx])

  useEffect(() => {
    const interval = setInterval(() => {
      setChatIdx(i => (i + 1) % CONVERSATIONS.length)
    }, 5500)
    return () => clearInterval(interval)
  }, [])

  const conv = CONVERSATIONS[chatIdx]

  const tickerItems = [
    "Powered by FYNHelp Intelligence",
    "Trained on 500+ CA-verified SME scenarios",
    "Real-time What-If Scenario Engine",
    "GST & Tax Intelligence built-in",
    "Connected to Indian Banks & Accounting",
  ]
  const tickerLoop = [...tickerItems, ...tickerItems]

  return (
    <>
      <style>{SKEUOMORPHIC_CSS}</style>
      <section ref={rootRef} className="fyn-hero-root">
        {/* Background layers */}
        <div className="fyn-bg-texture" />
        <div className="fyn-bg-vignette" />
        
        <div className="fyn-orb fyn-orb-1" />
        <div className="fyn-orb fyn-orb-2" />
        <div className="fyn-orb fyn-orb-3" />


        {/* HERO GRID */}
        <div style={{ position: "relative", zIndex: 5, maxWidth: 1320, margin: "0 auto", padding: "40px 32px 60px", display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 60, alignItems: "center" }}>
          {/* LEFT */}
          <div>
            <div className="fyn-eyebrow">
              <span className="fyn-pulse-dot" />
              <span>INDIA'S AI CFO PLATFORM</span>
            </div>

            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(48px, 6vw, 78px)", lineHeight: 1.02, letterSpacing: "0.005em", color: "#F4EDDA", margin: 0 }}>
              Don't just track your data. <span style={{ color: "#C41E1E" }}>Interrogate it.</span>
            </h1>

            <div className="fyn-red-highlight" style={{ marginTop: 22 }}>
              Meet CFO Fynny, stop running your business on gut feeling. Start running it on intelligence.
            </div>

            <p style={{ fontFamily: "'Instrument Sans', sans-serif", fontSize: 16, lineHeight: 1.65, color: "rgba(244,237,218,0.65)", margin: "16px 0 0", maxWidth: 560 }}>
              While other tools build board decks, Fynny provides the strategy. Upload any model or connect your stack to get predictive{" "}
              <span style={{ color: "#F4EDDA", fontStyle: "italic", fontWeight: 500 }}>'What-If' scenarios</span> and instant financial clarity.
            </p>

            {/* CTAs */}
            <div style={{ display: "flex", gap: 14, marginTop: 32, flexWrap: "wrap" }}>
              <button className="fyn-btn-primary" onClick={() => navigate("/waitlist")}>
                Join Waitlist <ArrowRight size={14} />
              </button>
              <button className="fyn-btn-ghost" onClick={() => navigate("/waitlist")}>
                <Play size={13} /> Book a demo
              </button>

            </div>

          </div>

          {/* RIGHT: 3D FYNNY PANEL */}
          <div style={{ position: "relative" }}>
            <div className="fyn-panel-3d">
              <div className="fyn-scan" />

              {/* HEADER */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(244,237,218,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(244,237,218,0.015)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg, #C41E1E, #8B1414)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 3px 8px rgba(196,30,30,0.4)" }}>
                    <Cpu size={17} color="#F4EDDA" />
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: "0.05em", color: "#F4EDDA" }}>CFO FYNNY</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(244,237,218,0.65)", letterSpacing: "0.08em" }}>AI FINANCIAL INTELLIGENCE</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 100 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1F5A46", animation: "fyn-blink 1.6s ease-in-out infinite" }} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 600, color: "#1F5A46", letterSpacing: "0.1em" }}>LIVE</span>
                </div>
              </div>

              {/* CHIPS */}
              <div style={{ padding: "14px 20px 6px" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 600, color: "rgba(244,237,218,0.6)", letterSpacing: "0.14em", marginBottom: 10 }}>TRY ASKING</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {[
                    { label: "Runway?", icon: <Clock size={11} /> },
                    { label: "Hire now?", icon: <Users size={11} /> },
                    { label: "GST status?", icon: <FileText size={11} /> },
                    { label: "What-If -20%", icon: <TrendingDown size={11} /> },
                  ].map((c, i) => (
                    <div key={i} className="fyn-action-btn" style={{ color: "rgba(244,237,218,0.85)", background: "rgba(244,237,218,0.06)", border: "1px solid rgba(244,237,218,0.12)" }}>
                      {c.icon} {c.label}
                    </div>
                  ))}
                </div>
              </div>


              {/* CHAT */}
              <div style={{ padding: "14px 20px", minHeight: 240 }}>
                <div className="fyn-chat-user" key={`u-${chatIdx}`}>
                  <div className="fyn-chat-user-bubble">{conv.user}</div>
                </div>

                {(chatPhase === "fynny" || chatPhase === "actions") && (
                  <div className="fyn-chat-fynny" key={`f-${chatIdx}`}>
                    <div className="fyn-chat-avatar"><Cpu size={12} /></div>
                    <div className="fyn-chat-fynny-bubble">
                      <span className="fyn-chat-label">{conv.label}</span>
                      <div>{conv.reply}</div>
                    </div>
                  </div>
                )}

                {chatPhase === "actions" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginLeft: 32, marginTop: 4 }}>
                    {conv.actions.map((a, i) => (
                      <button key={i} className="fyn-action-btn" style={{ color: a.color, background: a.bg, border: `1px solid ${a.border}`, animationDelay: `${i * 0.08}s` }}>
                        {a.icon} {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* INPUT BAR */}
              <div style={{ padding: "12px 20px 16px", borderTop: "1px solid rgba(244,237,218,0.05)", display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.2)" }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", background: "rgba(244,237,218,0.04)", border: "1px solid rgba(244,237,218,0.1)", borderRadius: 8, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)" }}>
                  <Zap size={13} color="rgba(244,237,218,0.55)" />
                  <span style={{ fontSize: 13, color: "rgba(244,237,218,0.55)" }}>Ask Fynny anything about your business...</span>
                </div>
                <button className="fyn-action-btn" style={{ color: "#F4EDDA", background: "rgba(244,237,218,0.08)", border: "1px solid rgba(244,237,218,0.16)", padding: "9px 13px" }}>
                  <FileText size={12} /> Report
                </button>
                <button style={{ width: 38, height: 38, borderRadius: 8, background: "#C41E1E", border: "none", color: "#F4EDDA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 3px 0 #8B1414, inset 0 1px 0 rgba(255,255,255,0.15)" }}>
                  <Send size={15} />
                </button>
              </div>
            </div>

            {/* Confidence badge */}
            <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>

              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", background: "rgba(244,237,218,0.05)", border: "1px solid rgba(244,237,218,0.12)", borderRadius: 100, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: "rgba(244,237,218,0.75)", letterSpacing: "0.06em" }}>
                <Shield size={12} color="#1F5A46" />
                Fynny Output · 94% Confidence · Powered by FYNHelp AI
              </div>

            </div>
          </div>
        </div>

        {/* TICKER */}
        <div className="fyn-ticker" style={{ position: "relative", zIndex: 5 }}>
          <div className="fyn-ticker-inner">
            {tickerLoop.map((t, i) => (
              <span key={i} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(244,237,218,0.5)", letterSpacing: "0.06em", marginRight: 24 }}>
                {t} <span style={{ color: "#C41E1E", margin: "0 4px" }}>·</span>
              </span>
            ))}
          </div>
        </div>

        {/* CONNECTIVITY */}
        <div style={{ position: "relative", zIndex: 5, maxWidth: 1320, margin: "0 auto", padding: "60px 32px 80px" }}>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: "0.02em", color: "#F4EDDA", textAlign: "center", margin: "0 0 24px" }}>
            Connect Your Entire Financial Stack
          </h2>

          <div className="fyn-conn-wrap">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#171208", letterSpacing: "0.1em", fontWeight: 600 }}>12+ LIVE INTEGRATIONS</span>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 100 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1F5A46" }} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#0A8862", letterSpacing: "0.08em" }}>All Systems Connected</span>
              </div>
            </div>

            <div style={{ overflow: "hidden" }}>
              <div className="fyn-logo-track">
                {[...BRANDS, ...BRANDS].map((b, i) => (
                  <div key={i} className="fyn-logo-pill">
                    <div className="fyn-logo-abbr" style={{ background: b.color }}>{b.abbr}</div>
                    <div>
                      <div className="fyn-logo-name">{b.name}</div>
                      <div className="fyn-logo-status">
                        <CheckCircle size={8} /> Connected
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
