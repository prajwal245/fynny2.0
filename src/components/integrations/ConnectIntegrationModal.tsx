import { useEffect, useState } from "react";
import { X, KeyRound, Link2, Upload as UploadIcon, MessageCircle } from "lucide-react";

export type ConnectMethod = "api_key" | "oauth" | "file" | "bot_token";

export interface ConnectIntegrationModalProps {
  open: boolean;
  onClose: () => void;
  provider: string;          // slug e.g. "razorpay"
  providerLabel: string;     // human "Razorpay"
  method: ConnectMethod;
  helperText?: string;
  onConfirm: (metadata: Record<string, unknown>) => void;
  busy?: boolean;
}

export default function ConnectIntegrationModal({
  open, onClose, provider, providerLabel, method, helperText, onConfirm, busy,
}: ConnectIntegrationModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const isWoo = provider === "woocommerce";
  const isTelegram = provider === "telegram";
  const isSlack = provider === "slack";
  const isShopify = provider === "shopify";
  const isAmazon = provider === "amazon_seller";

  useEffect(() => {
    if (open) {
      setApiKey(""); setApiSecret(""); setStoreUrl(""); setBotToken(""); setChatId(""); setShopDomain(""); setFile(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const Icon = method === "api_key" ? KeyRound : method === "oauth" ? Link2 : method === "bot_token" ? MessageCircle : UploadIcon;
  const canConfirm =
    method === "oauth" ? (isShopify ? /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shopDomain.trim()) : true) :
    method === "api_key"
      ? (isWoo
          ? (storeUrl.trim().length > 0 && apiKey.trim().length > 0 && apiSecret.trim().length > 0)
          : isAmazon
          ? (storeUrl.trim().length > 0 && apiKey.trim().length > 0 && apiSecret.trim().length > 0)
          : apiKey.trim().length > 0) :
    method === "bot_token" ? (isTelegram ? (botToken.trim().length > 5 && chatId.trim().length > 0) : botToken.trim().length > 5) :
    method === "file" ? !!file : false;

  const submit = () => {
    if (!canConfirm) return;
    const meta: Record<string, unknown> = { method };
    if (method === "api_key") {
      meta.api_key_last4 = apiKey.slice(-4);
      if (apiSecret) meta.has_secret = true;
      if (isWoo) {
        meta.store_url = storeUrl.trim();
        meta.__credentials = { store_url: storeUrl.trim(), consumer_key: apiKey.trim(), consumer_secret: apiSecret };
      } else if (isAmazon) {
        meta.__credentials = { marketplace_id: storeUrl.trim(), seller_id: apiKey.trim(), refresh_token: apiSecret };
      } else {
        meta.__credentials = { key_id: apiKey.trim(), key_secret: apiSecret };
      }
    } else if (method === "oauth" && isShopify) {
      meta.shop_domain = shopDomain.trim().toLowerCase();
      meta.__credentials = { shop_domain: shopDomain.trim().toLowerCase() };
    } else if (method === "bot_token") {
      meta.token_last4 = botToken.slice(-4);
      if (isTelegram) {
        meta.chat_id = chatId.trim();
        meta.__credentials = { token: botToken.trim(), chat_id: chatId.trim() };
      } else {
        meta.__credentials = { token: botToken.trim() };
      }
    } else if (method === "file") {
      meta.file_name = file?.name;
      meta.file_size = file?.size;
    }
    onConfirm(meta);
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(23,18,8,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF", borderRadius: 12, maxWidth: 440, width: "100%",
          boxShadow: "0 24px 64px rgba(23,18,8,0.20)", padding: 28, position: "relative",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <button
          type="button" onClick={onClose} aria-label="Close"
          style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: "rgba(23,18,8,0.45)" }}
        >
          <X size={18} />
        </button>

        <div style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 44, height: 44, borderRadius: 10, background: "#FAF7F0",
          border: "1px solid #E5DBC4", marginBottom: 14,
        }}>
          <Icon size={20} color="#A93838" />
        </div>

        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#171208", marginBottom: 6 }}>
          Connect {providerLabel}
        </h3>
        <p style={{ fontSize: 13, color: "#4A4540", lineHeight: 1.6, marginBottom: 18 }}>
          {helperText ?? (
            method === "api_key" ? "Paste the API credentials from your provider dashboard. Stored encrypted in your account." :
            method === "oauth" ? `You'll be redirected to ${providerLabel} to authorise FynHelp. We never see your password.` :
            method === "bot_token" ? `Create a bot in @BotFather and paste the token below.` :
            "Choose the file you'd like to upload. We'll parse and import it."
          )}
        </p>

        {method === "api_key" && (
          <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
            {isWoo && (
              <LabeledInput label="Store URL" value={storeUrl} onChange={setStoreUrl} placeholder="https://your-store.com" />
            )}
            {isAmazon && (
              <LabeledInput label="Marketplace ID" value={storeUrl} onChange={setStoreUrl} placeholder="A21TJRUUN4KGV (Amazon.in)" />
            )}
            <LabeledInput
              label={isWoo ? "Consumer Key" : isAmazon ? "Seller ID" : "API Key"}
              value={apiKey}
              onChange={setApiKey}
              placeholder={isWoo ? "ck_XXXXXXXXXXXX" : isAmazon ? "A1B2C3DEF4GHIJ" : "rzp_live_XXXXXXXXXXXX"}
            />
            <LabeledInput
              label={isWoo ? "Consumer Secret" : isAmazon ? "SP-API Refresh Token" : "API Secret (optional)"}
              value={apiSecret}
              onChange={setApiSecret}
              placeholder={isAmazon ? "Atzr|IwEBI..." : "••••••••"}
              type="password"
            />
          </div>
        )}
        {method === "oauth" && isShopify && (
          <div style={{ display: "grid", gap: 6, marginBottom: 18 }}>
            <LabeledInput
              label="Shopify Store Domain"
              value={shopDomain}
              onChange={setShopDomain}
              placeholder="your-store.myshopify.com"
            />
            <p style={{ fontSize: 11, color: "rgba(23,18,8,0.55)", lineHeight: 1.5, margin: 0 }}>
              Find this in your Shopify admin URL — it ends in .myshopify.com
            </p>
          </div>
        )}
        {method === "bot_token" && (
          <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
            <LabeledInput
              label={isSlack ? "Incoming Webhook URL" : "Bot Token"}
              value={botToken}
              onChange={setBotToken}
              placeholder={isSlack ? "https://hooks.slack.com/services/T.../B.../xxx" : "123456:ABC-DEF..."}
            />
            {isTelegram && (
              <LabeledInput
                label="Chat ID"
                value={chatId}
                onChange={setChatId}
                placeholder="-1001234567890 or personal chat id"
              />
            )}
          </div>
        )}
        {method === "file" && (
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 6, padding: "20px 16px", borderRadius: 8,
                border: "1.5px dashed #D4C9A8", background: "#FAF7F0", cursor: "pointer",
              }}
            >
              <UploadIcon size={18} color="#8B6914" />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#171208" }}>
                {file ? file.name : "Choose file or drop here"}
              </span>
              <span style={{ fontSize: 11, color: "rgba(23,18,8,0.50)" }}>
                {file ? `${(file.size / 1024).toFixed(1)} KB` : "CSV, Excel or PDF"}
              </span>
              <input
                type="file" hidden
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose} type="button"
            style={{
              padding: "9px 16px", borderRadius: 6, border: "1px solid #E5DBC4",
              background: "#FFFFFF", color: "#4A4540", fontWeight: 500, fontSize: 13, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit} disabled={!canConfirm || busy} type="button"
            style={{
              padding: "9px 18px", borderRadius: 6, border: "none",
              background: !canConfirm || busy ? "#D4C9A8" : "#A93838",
              color: "#FFFFFF", fontWeight: 600, fontSize: 13,
              cursor: !canConfirm || busy ? "not-allowed" : "pointer",
              letterSpacing: "0.01em",
            }}
          >
            {busy ? "Connecting…" : method === "oauth" ? `Continue to ${providerLabel}` : "Connect"}
          </button>
        </div>

        <p style={{ fontSize: 11, color: "rgba(23,18,8,0.45)", marginTop: 14, textAlign: "center" }}>
          Provider: <code style={{ background: "#FAF7F0", padding: "1px 5px", borderRadius: 3 }}>{provider}</code>
        </p>
      </div>
    </div>
  );
}

function LabeledInput({
  label, value, onChange, placeholder, type = "text",
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#3D3530", marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: "100%", padding: "9px 11px", borderRadius: 6,
          border: "1px solid #E5DBC4", background: "#FFFFFF",
          fontSize: 13, color: "#171208", outline: "none",
          fontFamily: "ui-monospace, monospace",
        }}
      />
    </label>
  );
}
