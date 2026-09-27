/**
 * Brand-design-system snapshot tests.
 *
 * These snapshot the rendered DOM (className strings included) of every
 * shared dashboard primitive. Any unintentional change to typography
 * (font-serif / text-fyn-h1 / text-fyn-metric), spacing (p-fyn-lg /
 * gap-fyn-md), or button/badge colors (bg-fyn-red / bg-[#DCFCE7] etc.)
 * will cause a snapshot diff and fail the test, surfacing the regression
 * in PR review.
 *
 * Run: bunx vitest run src/components/dashboard/ui.snapshot.test.tsx
 * Update intentionally: bunx vitest run --update src/components/dashboard/ui.snapshot.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  FynPage,
  FynPageTitle,
  FynCard,
  FynCardTitle,
  FynSectionTitle,
  FynLabel,
  FynMetric,
  FynButton,
  FynBadge,
  FynTable,
  FynTH,
  FynTR,
  FynTD,
  FynInput,
  FynSelect,
  FynTextarea,
  FynSearchInput,
  FynField,
  FynLoading,
  FynEmpty,
} from "./ui";

describe("dashboard design-system snapshots", () => {
  /* ── Layout ─────────────────────────────────────────── */
  it("FynPage wraps children with brand spacing", () => {
    const { container } = render(<FynPage><div>content</div></FynPage>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynPageTitle uses serif h1 and ink-60 sub", () => {
    const { container } = render(
      <FynPageTitle sub="Sub copy goes here">Compliance Health</FynPageTitle>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  /* ── Card ───────────────────────────────────────────── */
  it("FynCard renders with beige-card surface", () => {
    const { container } = render(
      <FynCard>
        <FynCardTitle>Card title</FynCardTitle>
        <p>body</p>
      </FynCard>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynSectionTitle uses serif h2", () => {
    const { container } = render(<FynSectionTitle>Section</FynSectionTitle>);
    expect(container.firstChild).toMatchSnapshot();
  });

  /* ── Labels & metrics ───────────────────────────────── */
  it("FynLabel uses tiny uppercase ink-45", () => {
    const { container } = render(<FynLabel>cash runway</FynLabel>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynMetric renders mono metric with label and sub", () => {
    const { container } = render(
      <FynMetric label="Cash Runway" value="142 days" sub="Healthy" />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  /* ── Buttons ────────────────────────────────────────── */
  it("FynButton primary uses fyn-red", () => {
    const { container } = render(<FynButton>Save</FynButton>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynButton secondary uses beige-card + ink border", () => {
    const { container } = render(<FynButton variant="secondary">Cancel</FynButton>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynButton ghost uses ink-60 text + ink-05 hover", () => {
    const { container } = render(<FynButton variant="ghost">Skip</FynButton>);
    expect(container.firstChild).toMatchSnapshot();
  });

  /* ── Badges (colour palette guard) ──────────────────── */
  it("FynBadge success uses brand green tones", () => {
    const { container } = render(<FynBadge tone="success">Filed</FynBadge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynBadge warning uses brand amber tones", () => {
    const { container } = render(<FynBadge tone="warning">Due soon</FynBadge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynBadge danger uses brand red tones", () => {
    const { container } = render(<FynBadge tone="danger">Overdue</FynBadge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynBadge neutral uses brand slate tones", () => {
    const { container } = render(<FynBadge tone="neutral">Draft</FynBadge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  /* ── Table ──────────────────────────────────────────── */
  it("FynTable renders header/row/cell with brand spacing", () => {
    const { container } = render(
      <FynTable>
        <thead>
          <tr>
            <FynTH>Filing</FynTH>
            <FynTH align="right">Amount</FynTH>
          </tr>
        </thead>
        <tbody>
          <FynTR>
            <FynTD>GSTR-3B (Mar)</FynTD>
            <FynTD align="right" mono>₹1,24,500</FynTD>
          </FynTR>
        </tbody>
      </FynTable>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  /* ── Form inputs ────────────────────────────────────── */
  it("FynInput uses brand input chrome", () => {
    const { container } = render(<FynInput placeholder="Enter GSTIN" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynSelect uses brand input chrome with chevron", () => {
    const { container } = render(
      <FynSelect defaultValue="">
        <option value="">Pick one</option>
        <option value="a">A</option>
      </FynSelect>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynTextarea uses brand input chrome", () => {
    const { container } = render(<FynTextarea placeholder="Notes" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynSearchInput renders icon + brand chrome", () => {
    const { container } = render(<FynSearchInput placeholder="Search filings…" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynField composes label/hint", () => {
    const { container } = render(
      <FynField label="GSTIN" hint="15 characters">
        <FynInput defaultValue="" />
      </FynField>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynField shows error in danger tone", () => {
    const { container } = render(
      <FynField label="GSTIN" error="Invalid format">
        <FynInput defaultValue="" />
      </FynField>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  /* ── States ─────────────────────────────────────────── */
  it("FynLoading renders skeleton rows", () => {
    const { container } = render(<FynLoading rows={2} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("FynEmpty renders title/description/action with brand chrome", () => {
    const { container } = render(
      <FynEmpty
        title="No filings yet"
        description="Connect GST to start tracking."
        action={<FynButton>Connect GST →</FynButton>}
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
