# UI/UX standards for FynHelp tables and actions

Applied (tested in `Selection.test.tsx`, `BooksExport.test.tsx`, `selection.test.ts`):
- **Multi-select on work queues** (Exceptions, Review, a document's transactions): a checkbox on every row with a 52×48 press area, a header box showing none / some / all, shift-click for a range, Ctrl/Cmd+A for all shown, Esc to clear, selected rows highlighted with a red edge.
- **A bar for bulk actions** that slides up with a live count (`aria-live`), "Select all N" when partial, and Clear. Reduced-motion users get no movement.
- **Reversible by default:** bulk decisions show one Undo for the whole batch; things that cannot be undone (discarding review rows) ask once more in place.
- **Audit trail:** bulk decisions that need a reason (ignore, reconciled elsewhere) take one required note applied to every line.
- **Large targets and one visual language:** 44px (38px inside table rows) buttons, white faces, red only on the edge/focus ring.
- **Modals are real dialogs:** Drawer and Modal carry `role="dialog"`, `aria-modal` and a label; global shortcuts pause while one is open.

Not yet covered (candidates): selection on Documents list, Clients, Chaser and Reports; keyboard row navigation (j/k); saved filters; column sorting everywhere; inline editing; skeletons on every list.
