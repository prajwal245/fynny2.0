/**
 * The liquid hover for every button: a blob of colour rises from the bottom edge, wobbles like liquid, and the arrow
 * in the button nudges forward. Pure CSS, so it works on links, buttons and every page without changing any markup.
 * Primary buttons fill with cream; quiet buttons get a soft wash. Switched off for people who ask for less motion.
 */
export const LIQUID_BUTTON_CSS = `
.v2-btn-primary, .v2-btn-ghost, .fh-btn-primary, .fh-btn-coral, .fh-btn-ghost, .sh-primary { position:relative; overflow:hidden; isolation:isolate; --lq:var(--v2-lq, #FFEBB9); --lq-ink:var(--v2-lq-ink, #090B11); }
.v2-btn-ghost, .fh-btn-ghost { --lq:rgba(249,16,58,.12); --lq-ink:currentColor; }
.v2-btn-primary::after, .v2-btn-ghost::after, .fh-btn-primary::after, .fh-btn-coral::after, .fh-btn-ghost::after, .sh-primary::after {
  content:""; position:absolute; z-index:-1; left:50%; top:100%; width:150%; aspect-ratio:1; pointer-events:none;
  background:var(--lq); border-radius:42% 58% 55% 45% / 48% 44% 56% 52%;
  transform:translate(-50%,0) scale(.25); opacity:0;
  transition:transform .75s cubic-bezier(.16,1,.3,1), opacity .25s ease;
}
.v2-btn-primary:hover::after, .v2-btn-ghost:hover::after, .fh-btn-primary:hover::after, .fh-btn-coral:hover::after, .fh-btn-ghost:hover::after, .sh-primary:hover::after,
.v2-btn-primary:focus-visible::after, .fh-btn-primary:focus-visible::after, .fh-btn-coral:focus-visible::after, .sh-primary:focus-visible::after {
  opacity:1; transform:translate(-50%,-60%) scale(1); animation:fh-liquid 1.8s ease-in-out .5s infinite alternate;
}
@keyframes fh-liquid { 0% { border-radius:42% 58% 55% 45% / 48% 44% 56% 52%; } 100% { border-radius:58% 42% 44% 56% / 55% 52% 48% 45%; } }
.v2-btn-primary, .fh-btn-primary, .fh-btn-coral, .sh-primary { transition:color .3s ease .12s, transform .45s cubic-bezier(.16,1,.3,1), box-shadow .45s; }
.v2-btn-primary:hover, .fh-btn-primary:hover, .fh-btn-coral:hover, .sh-primary:hover { color:var(--lq-ink) !important; }
.v2-btn-primary svg, .fh-btn-primary svg, .fh-btn-coral svg, .sh-primary svg, .v2-btn-ghost svg, .fh-btn-ghost svg { transition:transform .5s cubic-bezier(.34,1.56,.64,1); }
.v2-btn-primary:hover svg, .fh-btn-primary:hover svg, .fh-btn-coral:hover svg, .sh-primary:hover svg, .v2-btn-ghost:hover svg, .fh-btn-ghost:hover svg { transform:translate(3px,-1px); }
@media (prefers-reduced-motion: reduce) {
  .v2-btn-primary::after, .v2-btn-ghost::after, .fh-btn-primary::after, .fh-btn-coral::after, .fh-btn-ghost::after, .sh-primary::after { transition:none; animation:none !important; }
  .v2-btn-primary:hover svg, .fh-btn-primary:hover svg, .fh-btn-coral:hover svg, .sh-primary:hover svg { transform:none; }
}
`;
