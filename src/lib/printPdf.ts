/**
 * Opens server-rendered report HTML in a hidden frame and triggers the browser
 * print dialog, which every desktop and mobile browser can save as a PDF.
 */
export function printHtmlDocument(html: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const cleanup = () => {
    window.setTimeout(() => frame.remove(), 1000);
  };

  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      cleanup();
    }
  };

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("Could not open the print view");
  }
  doc.open();
  doc.write(html);
  doc.close();
}
