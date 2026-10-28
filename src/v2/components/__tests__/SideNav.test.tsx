// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { SideNav } from "../SideNav";

vi.mock("../FirstCloseGuide", () => ({ FirstCloseLauncher: () => null }));

function mount(path: string, partnerView = true) {
  const root = createRootRoute({
    component: () => (
      <SideNav pathname={path} partnerView={partnerView} counts={{ "/app/review": 2, "/app/exceptions": 3 }} open={false} onClose={() => {}} firmName="Rao and Co" canSignOff role="Partner" setRole={() => {}} onSignOut={() => {}} />
    ),
  });
  const paths = ["/app", "/app/clients", "/app/documents", "/app/review", "/app/exceptions", "/app/chaser", "/app/reports", "/app/settings"];
  const router = createRouter({
    routeTree: root.addChildren(paths.map((p) => createRoute({ getParentRoute: () => root, path: p }))),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("side navigation", () => {
  it("shows the firm, the logo rail and the groups, with the current group open", async () => {
    mount("/app/exceptions");
    expect(await screen.findByText("Rao and Co")).toBeTruthy();
    expect(screen.getByLabelText("FynHelp home")).toBeTruthy();
    // The group holding the current page is open: its pages are listed, with the count.
    expect(screen.getByRole("link", { name: /Exception Queue/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Review Queue/ })).toBeTruthy();
    // The other group is closed until opened.
    expect(screen.queryByRole("link", { name: "Documents" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Clients/ }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Documents" })).toBeTruthy());
  });

  it("keeps Settings for partners only", async () => {
    mount("/app", false);
    await screen.findByText("Rao and Co");
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });

  it("folds away to the rail and remembers it", async () => {
    mount("/app");
    await screen.findByText("Rao and Co");
    fireEvent.click(screen.getByRole("button", { name: "Hide the menu" }));
    expect(localStorage.getItem("fynhelp.v2.sidefold")).toBe("1");
    expect(document.querySelector(".v2-side")?.className).toContain("folded");
  });

  it("hides and shows with the [ key, but not while typing", async () => {
    mount("/app");
    await screen.findByText("Rao and Co");
    fireEvent.keyDown(window, { key: "[" });
    expect(localStorage.getItem("fynhelp.v2.sidefold")).toBe("1");
    fireEvent.keyDown(window, { key: "[" });
    expect(localStorage.getItem("fynhelp.v2.sidefold")).toBe("0");
    const box = document.createElement("input");
    document.body.appendChild(box);
    fireEvent.keyDown(box, { key: "[" });
    expect(localStorage.getItem("fynhelp.v2.sidefold")).toBe("0");
    box.remove();
  });
});
