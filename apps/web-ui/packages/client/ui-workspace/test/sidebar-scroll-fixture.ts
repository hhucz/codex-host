import type { SessionListState } from "@deepseek-ai/dsh-api-session-controller/client";
import type { WorkspaceId } from "@deepseek-ai/dsh-api-workspace-controller/types";
import { SessionId } from "@deepseek-ai/dsh-session/types";
import type { WorkspaceBrowserProps } from "../src/client/contract/slots.ts";
import type { WorkspaceShortcutState } from "../src/client/shortcuts.ts";
import type { SessionGroupBy, SessionOrderBy } from "../src/client/stores.ts";
import type { ArchivedFilter, SessionStatuses } from "../src/client/tree.ts";

export interface SidebarScrollFixture {
  props: WorkspaceBrowserProps;
  model: {
    list: SessionListState;
    statuses: SessionStatuses;
    view: {
      groupBy: SessionGroupBy;
      orderBy: SessionOrderBy;
      archivedFilter: ArchivedFilter;
      groupExpansion: Record<string, boolean>;
      sessionOrderByAccount: Record<string, string[]>;
    };
    onOpen?: WorkspaceBrowserProps["open"];
  };
}

export function sidebarFixture(groupBy: SessionGroupBy): SidebarScrollFixture {
  const ids = Array.from({ length: 25 }, (_, index) => SessionId(`session-${index + 1}`));
  const model: SidebarScrollFixture["model"] = {
    list: {
      ids,
      byId: Object.fromEntries(
        ids.map((id, index) => [
          id,
          {
            id,
            title: id,
            displayTitle: id,
            running: false,
            blank: false,
            retainedBy: {},
            updatedAt: ids.length - index,
          },
        ]),
      ),
      phase: "ready",
      projectionsBySession: {},
    },
    statuses: new Map(),
    view: {
      groupBy,
      orderBy: "updated",
      archivedFilter: "default",
      groupExpansion: {},
      sessionOrderByAccount: {},
    },
  };
  const workspaces = {
    items: Array.from({ length: 8 }, (_, index) => ({
      workspaceId: `workspace-${index + 1}` as WorkspaceId,
      title: `Workspace ${index + 1}`,
      path: `/tmp/sidebar-scroll-${index + 1}`,
      sessionIds: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    })),
    pinnedSessionIds: [],
    archivedSessionIds: [],
    phase: "ready" as const,
    state: "idle" as const,
    error: null,
  };
  const shortcuts: WorkspaceShortcutState = {
    searchRequest: 0,
    activityViewRequest: 0,
    addRequested: false,
    directoryBusy: false,
    renameTarget: null,
    forkError: null,
  };
  const noop = () => {};
  // Only the slot services the mounted sidebar reads need providers in this fixture.
  const props = {
    wide: true,
    usePanelInfo: (select) => select({ activePanelId: null }),
    useSessions: (select) => select(model.list),
    useSessionStatus: (select) => select(model.statuses),
    useWorkspaces: (select) => select(workspaces),
    useStore: (select) => select(model.view),
    useWorkspacePreferences: (select) =>
      select({
        status: "unavailable",
        value: undefined,
        base: undefined,
        user: undefined,
        revision: undefined,
        writable: false,
        mode: "memory",
      }),
    useHostInfo: (select) => select({ home: undefined, isLoopback: true }),
    useShortcuts: (select) => select([]),
    useWorkspaceShortcuts: (select) => select(shortcuts),
    useDirectoryFlow: (select) => select(false),
    renderSlot: () => null,
    t: (key) => key,
    open: (id) => model.onOpen?.(id),
    closeAddWorkspace: noop,
    setDirectoryBusy: noop,
    loadMoreSessions: noop,
    searchSessions: async () => ({ items: [], hasMore: false }),
    searchResultLimit: 50,
    actions: {
      retainAccountKeys: noop,
      syncSessionOrders: noop,
      setGroupBy: noop,
      setOrderBy: noop,
      setArchivedFilter: noop,
      setGroupExpanded: noop,
      setSectionExpanded: noop,
      setThreadsExpanded: noop,
      setSessionOrder: noop,
      pinSessionOrder: noop,
    },
  } satisfies Partial<WorkspaceBrowserProps>;
  return { model, props: props as WorkspaceBrowserProps };
}
