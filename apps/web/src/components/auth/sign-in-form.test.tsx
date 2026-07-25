import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "./sign-in-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const signInEmail = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => signInEmail(...args),
    },
  },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

async function submitForm() {
  fireEvent.change(screen.getByPlaceholderText("auth:forms.emailPlaceholder"), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(
    screen.getByPlaceholderText("auth:forms.passwordPlaceholder"),
    {
      target: { value: "password-12345" },
    },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "auth:signInForm.signIn" }),
  );
}

describe("SignInForm", () => {
  it("does not toast success or call onSuccess when the response is a 2FA redirect", async () => {
    signInEmail.mockResolvedValueOnce({
      data: { twoFactorRedirect: true },
      error: null,
    });
    const onSuccess = vi.fn();

    render(<SignInForm onSuccess={onSuccess} />);
    await submitForm();

    await waitFor(() => {
      expect(signInEmail).toHaveBeenCalled();
    });

    // Wait past the onSuccess setTimeout window of the success path.
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("toasts success and calls onSuccess on a normal sign-in", async () => {
    signInEmail.mockResolvedValueOnce({
      data: { token: "session-token", user: { id: "user-1" } },
      error: null,
    });
    const onSuccess = vi.fn();

    render(<SignInForm onSuccess={onSuccess} />);
    await submitForm();

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        "auth:signInForm.signedInSuccess",
      );
    });
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
