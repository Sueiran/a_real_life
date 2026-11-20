import { create } from 'zustand';
import type { ReplayData } from '../simulation/types';

export type View = 'setup' | 'simulating' | 'ending' | 'shared';

interface UiStore {
  view: View;
  historyOpen: boolean;
  shareError: string | null;
  sharedData: ReplayData | null;
  setView: (view: View) => void;
  setHistoryOpen: (open: boolean) => void;
  setShareError: (message: string | null) => void;
  showShared: (data: ReplayData) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  view: 'setup',
  historyOpen: false,
  shareError: null,
  sharedData: null,
  setView: (view) => set({ view }),
  setHistoryOpen: (open) => set({ historyOpen: open }),
  setShareError: (message) => set({ shareError: message }),
  showShared: (data) => set({ sharedData: data, shareError: null, view: 'shared' }),
}));