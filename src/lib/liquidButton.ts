/**
 * The liquid hover for every button: a blob of colour rises from the bottom edge, wobbles like liquid, and the arrow
 * in the button nudges forward. Pure CSS, so it works on links, buttons and every page without changing any markup.
 * Primary buttons fill with cream; quiet buttons get a soft wash. Switched off for people who ask for less motion.
 */
export const LIQUID_BUTTON_CSS = `
.v2-btn-primary, .v2-btn-ghost, .fh-btn-primary, .fh-btn-coral, .fh-btn-ghost, .sh-primary { position:relative; overflow:hidden; isolation:isolate; --lq:var(--v2-lq, #EADBC8); --lq-ink:var(--v2-lq-ink, #141210); }
.v2-btn-ghost, .fh-btn-ghost { --lq:rgba(217,43,43,.12); --lq-ink:currentColor; }
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

/* The round arrow knob: the main call to action ends in a ringed circle whose arrow slides through on hover. */
.v2-btn-primary.v2-btn-lg:not([data-busy="true"]), .fh-btn-primary, .fh-btn-coral, .sh-primary { padding-right:52px; --knob:#141210; --knob-ring:rgba(255,255,255,.55); }
.v2-btn-primary.v2-btn-lg:not([data-busy="true"])::before, .fh-btn-primary::before, .fh-btn-coral::before, .sh-primary::before {
  content:""; position:absolute; right:4px; top:50%; width:34px; height:34px; margin-top:-17px; border-radius:50%; pointer-events:none;
  background:var(--knob) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12h14M13 6l6 6-6 6'/%3E%3C/svg%3E") center / 16px no-repeat;
  box-shadow:0 0 0 2px var(--knob-ring); transition:transform .5s cubic-bezier(.34,1.56,.64,1);
}
.v2-btn-primary.v2-btn-lg:not([data-busy="true"]):hover::before, .fh-btn-primary:hover::before, .fh-btn-coral:hover::before, .sh-primary:hover::before { animation:fh-knob .7s cubic-bezier(.6,0,.2,1); transform:scale(1.06); }
@keyframes fh-knob { 0% { background-position:50% 50%; } 45% { background-position:190% 50%; } 46% { background-position:-90% 50%; } 100% { background-position:50% 50%; } }
.v2-btn-primary.v2-btn-lg > svg, .fh-btn-primary > svg, .fh-btn-coral > svg, .sh-primary > svg { display:none; }
/* Every button gives a little when pressed, and springs back. */
.v2-btn, .fh-btn, .sh-btn { transition-timing-function:cubic-bezier(.34,1.56,.64,1); }
.v2-btn:active, .fh-btn:active, .sh-btn:active { transform:scale(.96) !important; }
/* Cards rise on hover and settle with a spring; the plus on a card turns into a cross when it opens. */
.v2-lift { transition:transform .5s cubic-bezier(.34,1.56,.64,1), box-shadow .3s ease, border-color .3s ease !important; }
.v2-plus { display:inline-grid; place-items:center; width:34px; height:34px; border-radius:50%; border:1.5px solid currentColor; background:transparent; color:inherit; cursor:pointer; transition:transform .5s cubic-bezier(.34,1.56,.64,1), background .25s; }
.v2-plus:hover { background:rgba(127,127,127,.14); }
.v2-plus[aria-expanded="true"] { transform:rotate(135deg); }
@media (prefers-reduced-motion: reduce) { .v2-btn:active, .fh-btn:active, .sh-btn:active { transform:none !important; } .v2-lift, .v2-plus { transition:none !important; } .fh-btn-primary:hover::before, .fh-btn-coral:hover::before, .sh-primary:hover::before { animation:none; } }
`;
