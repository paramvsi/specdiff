// Screen state the top bar needs to know about.
import { create } from 'zustand';

interface PatchState {
  /** TX-12: the patch being opened on the Compare screen (null: the two editors). */
  patch: string | null;
  setPatch: (patch: string | null) => void;
}
export const usePatch = create<PatchState>((set) => ({
  patch: null,
  setPatch: (patch) => set({ patch }),
}));
