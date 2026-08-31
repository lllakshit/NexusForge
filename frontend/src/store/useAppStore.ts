import { create } from "zustand";

export type PageId =
  | "dashboard"
  | "models"
  | "playground"
  | "applications"
  | "agents"
  | "projects"
  | "jobs"
  | "logs"
  | "memory"
  | "mcp"
  | "incidents"
  | "infrastructure"
  | "monitoring"
  | "settings";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

type AppState = {
  currentPage: PageId;
  token: string;
  user: SessionUser | null;
  setCurrentPage: (page: PageId) => void;
  setSession: (token: string, user: SessionUser) => void;
  clearSession: () => void;
};

const savedToken = typeof localStorage === "undefined" ? "" : localStorage.getItem("nexusforge_token") ?? "";

export const useAppStore = create<AppState>((set) => ({
  currentPage: "dashboard",
  token: savedToken,
  user: null,
  setCurrentPage: (currentPage) => set({ currentPage }),
  setSession: (token, user) => {
    localStorage.setItem("nexusforge_token", token);
    set({ token, user });
  },
  clearSession: () => {
    localStorage.removeItem("nexusforge_token");
    set({ token: "", user: null, currentPage: "dashboard" });
  }
}));
