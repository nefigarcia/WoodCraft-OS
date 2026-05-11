import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser, AuthOrg } from "@woodcraft/shared";

interface AuthState {
  user: AuthUser | null;
  org: AuthOrg | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (
    user: AuthUser,
    org: AuthOrg,
    accessToken: string,
    refreshToken: string
  ) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      org: null,
      accessToken: null,
      refreshToken: null,

      setAuth: (user, org, accessToken, refreshToken) =>
        set({ user, org, accessToken, refreshToken }),

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      logout: () =>
        set({ user: null, org: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: "woodcraft-auth",
      partialize: (state) => ({
        user: state.user,
        org: state.org,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);
