import { create } from "zustand";

export type PageId = "dashboard" | "projects" | "jobs" | "logs" | "topology" | "replay";

type AppState = {
  currentPage: PageId;
  token: string;
  setCurrentPage: (page: PageId) => void;
  setToken: (token: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  currentPage: "dashboard",
  token: "",
  setCurrentPage: (currentPage) => set({ currentPage }),
  setToken: (token) => set({ token })
}));
