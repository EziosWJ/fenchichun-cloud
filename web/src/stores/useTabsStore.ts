import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface PageTab {
  key: string;
  label: string;
  href: string;
  closable: boolean;
}

export const HOME_TAB: PageTab = Object.freeze({
  key: '/dashboard',
  label: '工作台',
  href: '/dashboard',
  closable: false,
});

function ensureHomeTab(tabs: PageTab[] | undefined): PageTab[] {
  const safeTabs = Array.isArray(tabs)
    ? tabs.filter(
        (tab): tab is PageTab =>
          Boolean(tab) &&
          typeof tab.key === 'string' &&
          typeof tab.label === 'string' &&
          typeof tab.href === 'string',
      )
    : [];
  const withoutHome = safeTabs.filter((tab) => tab.key !== HOME_TAB.key);
  return [HOME_TAB, ...withoutHome];
}

interface TabsState {
  tabs: PageTab[];
  openTab: (tab: PageTab) => void;
  closeTab: (key: string) => void;
  resetTabs: () => void;
}

export const useTabsStore = create<TabsState>()(
  persist(
    (set) => ({
      tabs: [HOME_TAB],
      openTab: (tab) =>
        set((state) => {
          const existing = state.tabs.find((item) => item.key === tab.key);
          if (existing) {
            if (existing.label === tab.label && existing.href === tab.href) return state;
            return {
              tabs: state.tabs.map((item) =>
                item.key === tab.key ? { ...item, label: tab.label, href: tab.href } : item,
              ),
            };
          }
          return { tabs: [...state.tabs, tab] };
        }),
      closeTab: (key) =>
        set((state) => ({
          tabs: state.tabs.filter((tab) => tab.key !== key || !tab.closable),
        })),
      resetTabs: () => set({ tabs: [HOME_TAB] }),
    }),
    {
      name: 'admin-page-tabs',
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ tabs: state.tabs }),
      merge: (persisted, current) => ({
        ...current,
        tabs: ensureHomeTab((persisted as { tabs?: PageTab[] } | undefined)?.tabs),
      }),
    },
  ),
);
