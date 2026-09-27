/**
 * Dashboard page snapshot tests.
 *
 * Strategy: full pages depend on Supabase, React Query, Auth context, and the
 * Router. Rather than snapshot the entire page (huge + brittle), we mount each
 * page with mocked dependencies and snapshot the *rendered output*, which
 * exercises the shared primitives (FynCard/FynTable/FynBadge/FynButton) and the
 * Bloomberg-style spacing & typography classes used at the page level.
 *
 * If a primitive or token class changes (e.g. bg-fyn-beige-card → bg-white,
 * text-fyn-ink → text-gray-900, gap-fyn-md → gap-3), these snapshots fail.
 *
 * To accept intentional changes:
 *   bunx vitest run --update src/pages/dashboard/__tests__/dashboard-pages.snapshot.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "@/lib/router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// --- Mock DashboardLayout: strip the chrome (sidebar + header) so snapshots
// focus on each page's content. The page chrome is exercised separately.
vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="dashboard-layout-mock">{children}</div>
  ),
}));

// --- Mock Supabase client. Each test sets the mock response shape it needs.
const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user" } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

// --- Mock AuthContext where pages import it.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@fynhelp.com" },
    profile: { full_name: "Test User", business_id: "biz-1" },
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Helper: returns a chainable Supabase query stub that resolves to `data`.
const makeQuery = (data: unknown) => {
  const result = { data, error: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  const passthrough = () => chain;
  ["select", "eq", "order", "limit", "gte", "lte", "in", "neq"].forEach((m) => {
    chain[m] = vi.fn(passthrough);
  });
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  // Awaiting the chain itself resolves to the result (mirrors Supabase behaviour).
  chain.then = (onfulfilled?: (value: typeof result) => unknown) =>
    Promise.resolve(result).then(onfulfilled);
  return chain;
};

const renderPage = (ui: ReactNode) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  fromMock.mockReset();
  // Default: every table returns empty so pages render their empty/disconnected
  // states, these are the most stable snapshots and exercise the shared
  // primitives without needing realistic fixtures.
  fromMock.mockImplementation(() => makeQuery([]));
});

describe("Dashboard page snapshots, shared-primitive layout regression", () => {
  it("AuditReadinessPage: scorecard, area bars, accordion, vault use brand tokens", async () => {
    const { default: AuditReadinessPage } = await import("../AuditReadinessPage");
    const { container } = renderPage(<AuditReadinessPage />);
    expect(container.firstChild).toMatchSnapshot();
  });

  // TDSTaxPage was merged into GSTPage as the "TDS Filings" tab, snapshot retired.

  it("CompliancePage (empty state): FynEmpty + FynCard troubleshooting use brand tokens", async () => {
    // profiles → business_id (so queries enable); businesses.gstin → null;
    // gst_filings + tds_filings → empty → empty state renders with FynEmpty + TroubleshootingCard.
    fromMock.mockImplementation((table: string) => {
      if (table === "profiles") return makeQuery({ business_id: "biz-1" });
      if (table === "businesses") return makeQuery({ gstin: null });
      return makeQuery([]);
    });
    const { default: CompliancePage } = await import("../CompliancePage");
    const { container, findByText } = renderPage(<CompliancePage />);
    await findByText(/No Compliance Data/i);
    expect(container.firstChild).toMatchSnapshot();
  });
});
