import DOMPurify from "dompurify";

/**
 * Sanitises rich-text HTML before it is persisted or rendered.
 * Strips scripts, event handlers, iframes (except trusted video embeds),
 * and javascript: URLs.
 */
const ALLOWED_IFRAME_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
  "www.loom.com",
];

export function sanitizeRichText(dirty: string): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "code", "pre",
      "blockquote", "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "a", "img", "figure", "figcaption",
      "table", "thead", "tbody", "tr", "th", "td", "span", "div", "iframe",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "title", "width", "height",
      "colspan", "rowspan", "class", "start", "allow", "allowfullscreen", "loading",
    ],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/|#)/i,
    FORBID_TAGS: ["script", "style", "form", "input", "object", "embed", "link", "meta"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "srcdoc", "formaction"],
    ADD_ATTR: ["target"],
  });
}

/** Removes iframes pointing at untrusted hosts. Call after sanitizeRichText. */
export function stripUntrustedEmbeds(html: string): string {
  if (!html || typeof document === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("iframe").forEach((el) => {
    try {
      const host = new URL(el.getAttribute("src") ?? "", window.location.origin).hostname;
      if (!ALLOWED_IFRAME_HOSTS.includes(host)) el.remove();
    } catch {
      el.remove();
    }
  });
  return doc.body.innerHTML;
}

export function sanitizeForStorage(dirty: string): string {
  return stripUntrustedEmbeds(sanitizeRichText(dirty));
}
