import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TwoFactorSettings } from "./two-factor-settings";

const enable = vi.fn();
const disable = vi.fn();
const verifyTotp = vi.fn();
const generateBackupCodes = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    twoFactor: {
      enable: (...args: unknown[]) => enable(...args),
      disable: (...args: unknown[]) => disable(...args),
      verifyTotp: (...args: unknown[]) => verifyTotp(...args),
      generateBackupCodes: (...args: unknown[]) => generateBackupCodes(...args),
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

let mockUser: Record<string, unknown> | null = null;

vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  default: () => ({ user: mockUser, isLoading: false }),
  useAuth: () => ({ user: mockUser, isLoading: false }),
}));

const TEST_SECRET = "JBSWY3DPEHPK3PXP";
const TEST_TOTP_URI = `otpauth://totp/Kaneo:user%40example.com?secret=${TEST_SECRET}&issuer=Kaneo`;
const TEST_BACKUP_CODES = ["aaaa-1111", "bbbb-2222", "cccc-3333"];

const clipboardWriteText = vi.fn();

beforeEach(() => {
  mockUser = { id: "user-1", isAnonymous: false, twoFactorEnabled: false };
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: clipboardWriteText },
    configurable: true,
  });
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function startEnableFlow() {
  fireEvent.click(
    screen.getByRole("button", { name: /settings:twoFactor\.enable$/ }),
  );
}

function confirmPassword(password = "hunter2-secret") {
  fireEvent.change(
    screen.getByPlaceholderText(
      "settings:twoFactor.passwordDialog.passwordPlaceholder",
    ),
    { target: { value: password } },
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "settings:twoFactor.passwordDialog.confirm",
    }),
  );
}

async function enterQrStep() {
  enable.mockResolvedValueOnce({
    data: { totpURI: TEST_TOTP_URI, backupCodes: TEST_BACKUP_CODES },
    error: null,
  });
  startEnableFlow();
  confirmPassword();
  await waitFor(() => {
    expect(screen.getByText(TEST_SECRET)).toBeDefined();
  });
}

async function verifyEnrollment() {
  verifyTotp.mockResolvedValueOnce({ data: {}, error: null });
  fireEvent.change(
    screen.getByPlaceholderText("settings:twoFactor.qrStep.codePlaceholder"),
    { target: { value: "123456" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "settings:twoFactor.qrStep.verify" }),
  );
  await waitFor(() => {
    expect(verifyTotp).toHaveBeenCalledWith({ code: "123456" });
  });
}

describe("TwoFactorSettings", () => {
  it("renders nothing for anonymous users", () => {
    mockUser = { id: "guest", isAnonymous: true };
    const { container } = render(<TwoFactorSettings />);
    expect(container.innerHTML).toBe("");
  });

  it("calls enable with the password and renders the QR code and secret", async () => {
    render(<TwoFactorSettings />);
    await enterQrStep();

    expect(enable).toHaveBeenCalledWith({ password: "hunter2-secret" });
    expect(screen.getByText(TEST_SECRET)).toBeDefined();
    // The QR SVG encodes the totpURI.
    expect(document.querySelector("svg")).not.toBeNull();
    // Password dialog closed.
    expect(
      screen.queryByText("settings:twoFactor.passwordDialog.enableTitle"),
    ).toBeNull();
  });

  it("keeps the dialog open and shows an inline error on wrong password", async () => {
    enable.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid password" },
    });
    render(<TwoFactorSettings />);
    startEnableFlow();
    confirmPassword("wrong-password");

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Invalid password");
    });
    // Dialog stays open.
    expect(
      screen.getByText("settings:twoFactor.passwordDialog.enableTitle"),
    ).toBeDefined();
  });

  it("verifies the code, transitions to enabled, and shows backup codes once", async () => {
    render(<TwoFactorSettings />);
    await enterQrStep();
    await verifyEnrollment();

    // Backup codes modal shown with codes, copy, and download.
    await waitFor(() => {
      expect(
        screen.getByText("settings:twoFactor.backupCodesModal.title"),
      ).toBeDefined();
    });
    for (const code of TEST_BACKUP_CODES) {
      expect(screen.getByText(code)).toBeDefined();
    }

    // Done is gated until copy or download.
    const doneButton = screen.getByRole("button", {
      name: "settings:twoFactor.backupCodesModal.saveToContinue",
    });
    expect((doneButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:twoFactor.backupCodesModal.copy",
      }),
    );
    expect(clipboardWriteText).toHaveBeenCalledWith(
      TEST_BACKUP_CODES.join("\n"),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:twoFactor.backupCodesModal.done",
      }),
    );

    // Modal closed; enabled state visible with disable + regenerate.
    await waitFor(() => {
      expect(
        screen.queryByText("settings:twoFactor.backupCodesModal.title"),
      ).toBeNull();
    });
    expect(
      screen.getByRole("button", { name: /settings:twoFactor\.disable$/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", {
        name: "settings:twoFactor.regenerateBackupCodes",
      }),
    ).toBeDefined();
    // Codes are not re-shown anywhere.
    expect(screen.queryByText(TEST_BACKUP_CODES[0])).toBeNull();
  });

  it("clears the secret and totp URI from the DOM after leaving the QR step", async () => {
    render(<TwoFactorSettings />);
    await enterQrStep();
    expect(document.body.innerHTML).toContain(TEST_SECRET);

    await verifyEnrollment();

    expect(document.body.innerHTML).not.toContain(TEST_SECRET);
    expect(document.body.innerHTML).not.toContain("otpauth://");
  });

  it("clears the secret when enrollment is cancelled", async () => {
    render(<TwoFactorSettings />);
    await enterQrStep();

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    );

    expect(document.body.innerHTML).not.toContain(TEST_SECRET);
    expect(document.body.innerHTML).not.toContain("otpauth://");
    // Back to the disabled state.
    expect(
      screen.getByRole("button", { name: /settings:twoFactor\.enable$/ }),
    ).toBeDefined();
  });

  it("shows an inline error for an invalid verification code", async () => {
    render(<TwoFactorSettings />);
    await enterQrStep();

    verifyTotp.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid code" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("settings:twoFactor.qrStep.codePlaceholder"),
      { target: { value: "000000" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "settings:twoFactor.qrStep.verify" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Invalid code");
    });
    // Still on the QR step.
    expect(screen.getByText(TEST_SECRET)).toBeDefined();
  });

  it("shows disable and regenerate actions when 2FA is already enabled", () => {
    mockUser = { id: "user-1", isAnonymous: false, twoFactorEnabled: true };
    render(<TwoFactorSettings />);

    expect(
      screen.getByRole("button", { name: /settings:twoFactor\.disable$/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", {
        name: "settings:twoFactor.regenerateBackupCodes",
      }),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /settings:twoFactor\.enable$/ }),
    ).toBeNull();
  });

  it("disables 2FA with the password and returns to the disabled state", async () => {
    mockUser = { id: "user-1", isAnonymous: false, twoFactorEnabled: true };
    disable.mockResolvedValueOnce({ data: {}, error: null });
    render(<TwoFactorSettings />);

    fireEvent.click(
      screen.getByRole("button", { name: /settings:twoFactor\.disable$/ }),
    );
    confirmPassword("hunter2-secret");

    await waitFor(() => {
      expect(disable).toHaveBeenCalledWith({ password: "hunter2-secret" });
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /settings:twoFactor\.enable$/ }),
      ).toBeDefined();
    });
  });

  it("regenerates backup codes with the password and shows them once", async () => {
    mockUser = { id: "user-1", isAnonymous: false, twoFactorEnabled: true };
    const newCodes = ["dddd-4444", "eeee-5555"];
    generateBackupCodes.mockResolvedValueOnce({
      data: { backupCodes: newCodes },
      error: null,
    });
    render(<TwoFactorSettings />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:twoFactor.regenerateBackupCodes",
      }),
    );
    confirmPassword("hunter2-secret");

    await waitFor(() => {
      expect(generateBackupCodes).toHaveBeenCalledWith({
        password: "hunter2-secret",
      });
    });
    await waitFor(() => {
      expect(
        screen.getByText("settings:twoFactor.backupCodesModal.title"),
      ).toBeDefined();
    });
    for (const code of newCodes) {
      expect(screen.getByText(code)).toBeDefined();
    }
  });
});
