import {
  SiHdfcbank,
  SiIcicibank,
  SiAxisbank,
  SiRazorpay,
  SiZoho,
  SiQuickbooks,
  SiPaytm,
  SiPhonepe,
  SiStripe,
  SiShopify,
} from "react-icons/si";

/* Real brand marks for the systems FynHelp reads from. */

const ROW_A = [
  { n: "HDFC Bank", I: SiHdfcbank },
  { n: "ICICI Bank", I: SiIcicibank },
  { n: "Axis Bank", I: SiAxisbank },
  { n: "Razorpay", I: SiRazorpay },
  { n: "Zoho Books", I: SiZoho },
  { n: "QuickBooks", I: SiQuickbooks },
];

const ROW_B = [
  { n: "Paytm", I: SiPaytm },
  { n: "PhonePe", I: SiPhonepe },
  { n: "Stripe", I: SiStripe },
  { n: "Shopify", I: SiShopify },
  { n: "Tally Prime", I: null },
  { n: "GSTN", I: null },
  { n: "Busy", I: null },
];

const CSS = `
.bm { background:#F2EEE7; padding:44px 0 40px; text-align:center; border-top:1px solid rgba(26,16,8,.06); border-bottom:1px solid rgba(26,16,8,.06); }
.bm .cap { font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:rgba(26,16,8,.42); font-weight:600; }
.bm-rail { margin-top:24px; overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent); }
.bm-rail + .bm-rail { margin-top:14px; }
.bm-track { display:flex; align-items:center; gap:46px; width:max-content; }
.bm-a { animation:bm-l 38s linear infinite; }
.bm-b { animation:bm-r 44s linear infinite; }
@keyframes bm-l { to { transform:translateX(-50%); } }
@keyframes bm-r { from { transform:translateX(-50%); } to { transform:translateX(0); } }
.bm-rail:hover .bm-track { animation-play-state:paused; }
.bm-item { display:flex; align-items:center; gap:10px; color:rgba(26,16,8,.55); white-space:nowrap;
  font-size:14.5px; font-weight:600; letter-spacing:-.01em; transition:color .3s ease, opacity .3s ease; opacity:.78; }
.bm-item:hover { color:#A93838; opacity:1; }
.bm-item svg { width:24px; height:24px; flex:0 0 auto; }
.bm-word { font-family:'Fraunces',Georgia,serif; font-style:italic; font-size:19px; }
@media (max-width:640px){ .bm-track{ gap:30px; } .bm-item{ font-size:13px; } .bm-item svg{ width:20px; height:20px; } .bm-word{ font-size:16px; } }
@media (prefers-reduced-motion: reduce){ .bm-track{ animation:none; } }
`;

const Row = ({ items, cls }: { items: { n: string; I: React.ElementType | null }[]; cls: string }) => (
  <div className="bm-rail">
    <div className={`bm-track ${cls}`}>
      {[...items, ...items, ...items, ...items].map(({ n, I }, i) => (
        <span className="bm-item" key={`${n}-${i}`}>
          {I ? <I aria-hidden="true" /> : null}
          <span className={I ? "" : "bm-word"}>{n}</span>
        </span>
      ))}
    </div>
  </div>
);

export default function BrandMarquee() {
  return (
    <section className="bm" aria-label="Supported systems and banks">
      <style>{CSS}</style>
      <div className="fh-wrap">
        <div className="cap">Reads from the systems Indian practices already run on</div>
      </div>
      <Row items={ROW_A} cls="bm-a" />
      <Row items={ROW_B} cls="bm-b" />
    </section>
  );
}
