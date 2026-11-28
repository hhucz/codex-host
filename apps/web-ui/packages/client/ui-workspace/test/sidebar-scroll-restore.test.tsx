// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceBrowser } from "../src/client/rows/WorkspaceBrowser.tsx";
import { sidebarFixture, type SidebarScrollFixture } from "./sidebar-scroll-fixture.ts";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const setScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!.set!;
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(100);
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
    const rows = this.querySelectorAll(
      '[data-row-key^="session:"], [data-row-key^="recent:"], [aria-label="search.results.aria"] [role="treeitem"]',
    );
    return 100 + rows.length * 40;
  });
  vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function (
    this: Element,
    top: number,
  ) {
    setScrollTop.call(this, Math.max(0, Math.min(top, this.scrollHeight - this.clientHeight)));
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function render(fixture: SidebarScrollFixture, wide = true): void {
  act(() => root.render(<WorkspaceBrowser {...fixture.props} wide={wide} />));
}

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = host.querySelector<T>(selector);
  if (node === null) throw new Error(`Missing ${selector}`);
  return node;
}

function click(selector: string): void {
  act(() => element(selector).click());
}

function scroll(node: HTMLElement, top: number): void {
  node.scrollTop = top;
  node.dispatchEvent(new Event("scroll"));
}

function search(query: string): void {
  const input = element<HTMLInputElement>('input[type="text"]');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("restores the expanded Workspace tree and session window after unmounting", () => {
  const fixture = sidebarFixture("workspace-tree");
  render(fixture);
  expect(host.querySelector('[data-row-key="workspace:workspace-8"]')).toBeNull();
  expect(host.querySelector('[data-row-key="recent:session-15"]')).toBeNull();
  click('[data-row-key="overflow:workspaces"]');
  click('[data-row-key="overflow:"]');
  const tree = element('[role="tree"]');
  scroll(tree, 317);

  render(fixture, false);
  expect(tree.isConnected).toBe(false);
  render(fixture);

  expect(element('[role="tree"]').scrollTop).toBe(317);
  expect(host.querySelectorAll('[data-row-key^="workspace:workspace-"]')).toHaveLength(8);
  expect(host.querySelectorAll('[data-row-key^="recent:"]')).toHaveLength(15);
});

it("restores the flat page once ready and does not override a newer live scroll", () => {
  const fixture = sidebarFixture("flat");
  render(fixture);
  click('[data-row-key="overflow:flat"]');
  const tree = element('[role="tree"]');
  scroll(tree, 420);
  render(fixture, false);
  expect(tree.isConnected).toBe(false);

  const ready = fixture.model.list;
  fixture.model.list = { ...ready, phase: "pending", ids: [], byId: {} };
  render(fixture);
  const loadingTree = element('[role="tree"]');
  expect(loadingTree.scrollTop).toBe(0);
  scroll(loadingTree, 0);
  fixture.model.list = ready;
  render(fixture);

  const restoredTree = element('[role="tree"]');
  expect(restoredTree.scrollTop).toBe(420);
  expect(host.querySelectorAll('[data-row-key^="session:"]')).toHaveLength(20);
  // A native scroll notification can arrive after the next React commit.
  restoredTree.scrollTop = 486;
  fixture.model.statuses = new Map([
    [ready.ids[23]!, { running: true, pendingInteraction: undefined, completionUnread: false }],
  ]);
  render(fixture);
  expect(element('[role="tree"]').scrollTop).toBe(486);
  expect(host.querySelector('[data-row-key="session:session-24"]')).not.toBeNull();
});

it("keeps a pending search-result reveal ahead of restoration and remembers its destination", () => {
  const fixture = sidebarFixture("flat");
  const reveals: { row: string | undefined; from: number; options?: ScrollIntoViewOptions }[] = [];
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value(this: HTMLElement, options: ScrollIntoViewOptions) {
      const node = this.closest<HTMLElement>('[role="tree"]')!;
      reveals.push({ row: this.dataset.rowKey, from: node.scrollTop, options });
      node.scrollTop = 155;
    },
  });
  try {
    render(fixture);
    scroll(element('[role="tree"]'), 245);
    search("session-4");
    fixture.model.onOpen = (id) => {
      expect(id).toBe("session-4");
      root.render(<WorkspaceBrowser {...fixture.props} wide={false} />);
    };
    click('[aria-label="search.results.aria"] [role="treeitem"]');
    expect(host.querySelector('[role="tree"]')).toBeNull();
    render(fixture);
    expect(reveals).toEqual([{ row: "session:session-4", from: 0, options: { block: "nearest" } }]);
    expect(element('[role="tree"]').scrollTop).toBe(155);

    render(fixture, false);
    render(fixture);
    expect(element('[role="tree"]').scrollTop).toBe(155);
    expect(reveals).toHaveLength(1);
  } finally {
    if (original === undefined) Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    else Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
  }
});

it("keeps activity, search queries, and each ordered view in separate scroll histories", async () => {
  vi.useFakeTimers();
  const fixture = sidebarFixture("flat");
  const active = new Map(
    fixture.model.list.ids.map((id) => [
      id,
      { running: true, pendingInteraction: undefined, completionUnread: false },
    ]),
  );
  fixture.model.statuses = active;
  render(fixture);
  scroll(element('[aria-label="section.sessions"][role="tree"]'), 260);
  click('button[aria-label="activityView.label"]');
  const activity = element('[aria-label="activityView.label"][role="tree"]');
  expect(activity.scrollTop).toBe(0);
  scroll(activity, 200);
  fixture.model.statuses = new Map();
  render(fixture);
  expect(activity.querySelectorAll('[data-row-key^="session:"]')).toHaveLength(0);
  scroll(activity, 0);
  render(fixture, false);
  fixture.model.statuses = active;
  render(fixture);
  expect(element('[aria-label="activityView.label"][role="tree"]').scrollTop).toBe(200);
  click('button[aria-label="activityView.label"]');
  expect(element('[role="tree"]').scrollTop).toBe(260);

  search("session");
  await act(() => vi.advanceTimersByTimeAsync(250));
  const searchList = () => element('[aria-label="search.results.aria"]').parentElement!;
  expect(searchList().querySelectorAll('[role="treeitem"]')).toHaveLength(25);
  scroll(searchList(), 222);
  render(fixture, false);
  render(fixture);
  expect(searchList().scrollTop).toBe(222);
  search("session-1");
  await act(() => vi.advanceTimersByTimeAsync(250));
  expect(searchList().scrollTop).toBe(0);
  search("");
  expect(element('[role="tree"]').scrollTop).toBe(260);

  fixture.model.view.orderBy = "manual";
  render(fixture);
  expect(element('[role="tree"]').scrollTop).toBe(0);
  fixture.model.view.orderBy = "updated";
  render(fixture);
  expect(element('[role="tree"]').scrollTop).toBe(260);
});

it.each([0, 45])("waits for activity rows unless the user scrolls (%i)", (userTop) => {
  const fixture = sidebarFixture("flat");
  const active = new Map(
    fixture.model.list.ids.map((id) => [
      id,
      { running: true, pendingInteraction: undefined, completionUnread: false },
    ]),
  );
  fixture.model.statuses = active;
  render(fixture);
  click('button[aria-label="activityView.label"]');
  const activityTree = () => element('[aria-label="activityView.label"][role="tree"]');
  scroll(activityTree(), 200);
  render(fixture, false);

  fixture.model.statuses = userTop === 0 ? new Map() : new Map([...active].slice(0, 2));
  render(fixture);
  expect(activityTree().scrollTop).toBe(0);
  if (userTop !== 0) scroll(activityTree(), userTop);
  fixture.model.statuses = active;
  render(fixture);

  expect(activityTree().scrollTop).toBe(userTop || 200);
});
