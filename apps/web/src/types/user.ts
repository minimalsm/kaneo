import type { User as BetterAuthUser } from "better-auth/types";

export type User = BetterAuthUser & {
  locale?: string | null;
  isAnonymous?: boolean | null;
  twoFactorEnabled?: boolean | null;
};
