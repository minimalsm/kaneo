import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyTotp = vi.fn();
const verifyBackupCode = vi.fn();
const historyPush = vi.fn();

let mockSearch: { redirect?: string; invitationId?: string } = {};

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    twoFactor: {
      verifyTotp: (...args: unknown[]) => verifyTotp(...args),
      verifyBackupCode: (...args: unknown[]) => verifyBackupCode(...args),
    },
  },
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () => (options: { component: React.ComponentType<unknown> }) =>
      options,
  useRouter: () => ({ history: { push: historyPush } }),
  useSearch: () => mockSearch,
  Link: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
}));

import { Route } from "./two-factor";

// input-otp observes its container size on mount; jsdom has no ResizeObserver.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const TwoFactorVerify = (Route as unknown as { component: React.ComponentType })
  .component;

beforeEach(() => {
  mockSearch = {};
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function getOtpInput() {
  const input = document.querySelector("input");
  if (!input) {
    throw new Error("OTP input not found");
  }
  return input;
}

function enterTotpCode(code: string) {
  fireEvent.change(getOtpInput(), { target: { value: code } });
}

describe("TwoFactorVerify", () => {
  it("auto-submits and calls verifyTotp when the sixth digit is entered", async () => {
    verifyTotp.mockResolvedValueOnce({ data: {}, error: null });
    render(<TwoFactorVerify />);

    enterTotpCode("123456");

    await waitFor(() => {
      expect(verifyTotp).toHaveBeenCalledWith({ code: "123456" });
    });
    expect(verifyBackupCode).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(historyPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("switches to a backup-code input and calls verifyBackupCode", async () => {
    verifyBackupCode.mockResolvedValueOnce({ data: {}, error: null });
    render(<TwoFactorVerify />);

    fireEvent.click(
      screen.getByRole("button", { name: "auth:twoFactor.useBackupCode" }),
    );

    const backupInput = screen.getByPlaceholderText(
      "auth:twoFactor.backupCodePlaceholder",
    );
    fireEvent.change(backupInput, { target: { value: " aaaa-1111 " } });
    fireEvent.click(
      screen.getByRole("button", { name: "auth:twoFactor.verify" }),
    );

    await waitFor(() => {
      expect(verifyBackupCode).toHaveBeenCalledWith({ code: "aaaa-1111" });
    });
    expect(verifyTotp).not.toHaveBeenCalled();
  });

  it("switches back to the authenticator-code input from backup mode", () => {
    render(<TwoFactorVerify />);

    fireEvent.click(
      screen.getByRole("button", { name: "auth:twoFactor.useBackupCode" }),
    );
    expect(
      screen.getByPlaceholderText("auth:twoFactor.backupCodePlaceholder"),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", {
        name: "auth:twoFactor.useAuthenticatorCode",
      }),
    );
    expect(
      screen.queryByPlaceholderText("auth:twoFactor.backupCodePlaceholder"),
    ).toBeNull();
  });

  it.each(["INVALID_TWO_FACTOR_COOKIE", "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE"])(
    "renders the expired terminal state for %s with a back link preserving search params",
    async (code) => {
      mockSearch = { redirect: "/dashboard/settings", invitationId: "inv-1" };
      verifyTotp.mockResolvedValueOnce({
        data: null,
        error: { code, message: "expired" },
      });
      render(<TwoFactorVerify />);

      enterTotpCode("123456");

      await waitFor(() => {
        expect(screen.getByText("auth:twoFactor.expiredMessage")).toBeDefined();
      });
      // No retry input remains.
      expect(document.querySelector("input")).toBeNull();

      fireEvent.click(
        screen.getByRole("button", { name: "auth:twoFactor.backToSignIn" }),
      );
      expect(historyPush).toHaveBeenCalledWith(
        "/auth/sign-in?redirect=%2Fdashboard%2Fsettings&invitationId=inv-1",
      );
    },
  );

  it("renders the locked terminal state without retry for ACCOUNT_TEMPORARILY_LOCKED", async () => {
    verifyTotp.mockResolvedValueOnce({
      data: null,
      error: { code: "ACCOUNT_TEMPORARILY_LOCKED", message: "locked" },
    });
    render(<TwoFactorVerify />);

    enterTotpCode("123456");

    await waitFor(() => {
      expect(screen.getByText("auth:twoFactor.lockedMessage")).toBeDefined();
    });
    // No code input or verify button remains.
    expect(document.querySelector("input")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "auth:twoFactor.verify" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "auth:twoFactor.backToSignIn" }),
    ).toBeDefined();
  });

  it("rejects a protocol-relative //evil.com redirect and falls back to the default", async () => {
    mockSearch = { redirect: "//evil.com" };
    verifyTotp.mockResolvedValueOnce({ data: {}, error: null });
    render(<TwoFactorVerify />);

    enterTotpCode("123456");

    await waitFor(() => {
      expect(historyPush).toHaveBeenCalledWith("/dashboard");
    });
    expect(historyPush).not.toHaveBeenCalledWith("//evil.com");
  });

  it("uses a safe same-origin redirect after verification", async () => {
    mockSearch = { redirect: "/dashboard/settings" };
    verifyTotp.mockResolvedValueOnce({ data: {}, error: null });
    render(<TwoFactorVerify />);

    enterTotpCode("123456");

    await waitFor(() => {
      expect(historyPush).toHaveBeenCalledWith("/dashboard/settings");
    });
  });
});
