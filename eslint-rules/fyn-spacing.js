/**
 * ESLint rule: fyn-spacing/dashboard-gap-scale
 *
 * Auto-fixes raw Tailwind gap utilities (gap-3..gap-7, gap-x-3..7, gap-y-3..7)
 * inside /dashboard files to the brand fyn-* spacing scale:
 *
 *   gap-3 / gap-x-3 / gap-y-3   →  gap-fyn-sm   (12px → 8px)
 *   gap-4 / gap-x-4 / gap-y-4   →  gap-fyn-md   (16px → 16px)
 *   gap-5 / gap-x-5 / gap-y-5   →  gap-fyn-md   (20px → 16px)
 *   gap-6 / gap-x-6 / gap-y-6   →  gap-fyn-lg   (24px → 24px)
 *   gap-7 / gap-x-7 / gap-y-7   →  gap-fyn-xl   (28px → 32px)
 *
 * Runs on string literals and template-literal text segments — both
 * `className="gap-4"` and `cn(\`flex gap-4 ${x}\`)` are covered.
 *
 * Scope is enforced via `files:` in eslint.config.js, so this rule only
 * fires on src/pages/dashboard/** and src/components/dashboard/**.
 */

const GAP_MAP = {
  3: "fyn-sm",
  4: "fyn-md",
  5: "fyn-md",
  6: "fyn-lg",
  7: "fyn-xl",
};

// Matches gap-3 | gap-x-3 | gap-y-3 (digits 3..7) as a whole word.
// Capture group 1 = optional "x-" or "y-" axis; group 2 = digit.
const GAP_REGEX = /\bgap-(x-|y-)?([3-7])\b/g;

function rewrite(value) {
  let changed = false;
  const next = value.replace(GAP_REGEX, (_match, axis, digit) => {
    const token = GAP_MAP[digit];
    if (!token) return _match;
    changed = true;
    return `gap-${axis ?? ""}${token}`;
  });
  return changed ? next : null;
}

const rule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "Use the fyn-* spacing scale (gap-fyn-sm/md/lg/xl) instead of raw gap-3..gap-7 in /dashboard files.",
    },
    schema: [],
    messages: {
      useFynScale:
        "Use the fyn spacing scale: replace `{{ from }}` with `{{ to }}` in /dashboard files.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function reportNode(node, raw, rangeStart) {
      const fixed = rewrite(raw);
      if (fixed === null) return;

      // Build a per-token diagnostic so the message names the actual class.
      let m;
      const localRegex = /\bgap-(x-|y-)?([3-7])\b/g;
      while ((m = localRegex.exec(raw)) !== null) {
        const digit = m[2];
        const axis = m[1] ?? "";
        const from = `gap-${axis}${digit}`;
        const to = `gap-${axis}${GAP_MAP[digit]}`;
        const start = rangeStart + m.index;
        const end = start + m[0].length;
        context.report({
          node,
          loc: {
            start: sourceCode.getLocFromIndex(start),
            end: sourceCode.getLocFromIndex(end),
          },
          messageId: "useFynScale",
          data: { from, to },
          fix(fixer) {
            return fixer.replaceTextRange([start, end], to);
          },
        });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (!GAP_REGEX.test(node.value)) {
          GAP_REGEX.lastIndex = 0;
          return;
        }
        GAP_REGEX.lastIndex = 0;
        // node.range = [openQuote, closeQuote]; string body starts at range[0] + 1.
        reportNode(node, node.value, node.range[0] + 1);
      },
      TemplateElement(node) {
        const raw = node.value.raw;
        if (!raw) return;
        if (!GAP_REGEX.test(raw)) {
          GAP_REGEX.lastIndex = 0;
          return;
        }
        GAP_REGEX.lastIndex = 0;
        // TemplateElement.range covers the raw text between delimiters; first
        // element starts after the opening backtick, later ones after `}`.
        // In both cases node.range[0] is the index of the first raw char.
        reportNode(node, raw, node.range[0]);
      },
    };
  },
};

const plugin = {
  meta: { name: "fyn-spacing", version: "1.0.0" },
  rules: {
    "dashboard-gap-scale": rule,
  },
};

export default plugin;
