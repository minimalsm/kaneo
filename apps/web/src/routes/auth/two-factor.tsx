import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { createFileRoute, useRouter, useSearch } from "@tanstack/react-router";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeft, KeyRound, Smartphone } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import PageTitle from "@/components/page-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";
import { AuthLayout } from "../../components/auth/layout";

export const Route = createFileRoute("/auth/two-factor")({
  component: TwoFactorVerify,
  validateSearch: (search: Record<string, unknown>) => ({
    invitationId: search.invitationId as string | undefined,
    redirect: search.redirect as string | undefined,
  }),
});

type VerifyError = {
  code?: string | undefined;
  message?: string | undefined;
};

function TwoFactorVerify() {
  const { t } = useTranslation();
  const { history } = useRouter();
  const { invitationId, redirect } = useSearch({
    from: "/auth/two-factor",
  });
  const [isPending, setIsPending] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [terminalState, setTerminalState] = useState<
    "expired" | "locked" | null
  >(null);

  const totpSchema = useMemo(
    () =>
      z.object({
        code: z.string().length(6, t("auth:twoFactor.validation.codeLength")),
      }),
    [t],
  );

  const backupCodeSchema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .trim()
          .min(1, t("auth:twoFactor.validation.backupCodeRequired")),
      }),
    [t],
  );

  type CodeFormValues = z.infer<typeof totpSchema>;

  const form = useForm<CodeFormValues>({
    resolver: standardSchemaResolver(
      useBackupCode ? backupCodeSchema : totpSchema,
    ),
    defaultValues: { code: "" },
  });

  const safeRedirect = useMemo(() => {
    if (redirect?.startsWith("/") && !redirect.includes("//")) {
      return redirect;
    }
    return undefined;
  }, [redirect]);

  const signInPath = useMemo(() => {
    const params = new URLSearchParams();
    if (redirect) {
      params.set("redirect", redirect);
    }
    if (invitationId) {
      params.set("invitationId", invitationId);
    }
    const query = params.toString();
    return query ? `/auth/sign-in?${query}` : "/auth/sign-in";
  }, [redirect, invitationId]);

  const handleVerifyError = useCallback(
    (error: VerifyError) => {
      if (
        error.code === "INVALID_TWO_FACTOR_COOKIE" ||
        error.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE"
      ) {
        setTerminalState("expired");
        return;
      }
      if (error.code === "ACCOUNT_TEMPORARILY_LOCKED") {
        setTerminalState("locked");
        return;
      }
      toast.error(error.message || t("auth:twoFactor.toast.invalidCode"));
    },
    [t],
  );

  const onSubmit = useCallback(
    async (data: CodeFormValues) => {
      setIsPending(true);
      try {
        const result = useBackupCode
          ? await authClient.twoFactor.verifyBackupCode({
              code: data.code.trim(),
            })
          : await authClient.twoFactor.verifyTotp({ code: data.code });

        if (result.error) {
          handleVerifyError(result.error);
          return;
        }

        toast.success(t("auth:twoFactor.toast.signedInSuccess"));
        if (safeRedirect) {
          history.push(safeRedirect);
        } else if (invitationId) {
          history.push(`/invitation/accept/${invitationId}`);
        } else {
          history.push("/dashboard");
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("auth:twoFactor.toast.verifyFailed"),
        );
      } finally {
        setIsPending(false);
      }
    },
    [useBackupCode, handleVerifyError, invitationId, history, safeRedirect, t],
  );

  useEffect(() => {
    if (useBackupCode) {
      return;
    }
    const subscription = form.watch((value, { name }) => {
      if (name === "code" && value.code?.length === 6 && !isPending) {
        form.handleSubmit(onSubmit)();
      }
    });
    return () => subscription.unsubscribe();
  }, [form, isPending, onSubmit, useBackupCode]);

  const toggleMode = () => {
    setUseBackupCode((previous) => !previous);
    form.reset({ code: "" });
  };

  if (terminalState) {
    return (
      <>
        <PageTitle title={t("auth:twoFactor.pageTitle")} />
        <AuthLayout
          title={t("auth:twoFactor.title")}
          subtitle={
            terminalState === "expired"
              ? t("auth:twoFactor.expiredTitle")
              : t("auth:twoFactor.lockedTitle")
          }
        >
          <div className="space-y-4">
            <Alert variant="error">
              <AlertDescription>
                {terminalState === "expired"
                  ? t("auth:twoFactor.expiredMessage")
                  : t("auth:twoFactor.lockedMessage")}
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              variant="outline"
              onClick={() => history.push(signInPath)}
              className="w-full"
            >
              <ArrowLeft className="size-4" />
              {t("auth:twoFactor.backToSignIn")}
            </Button>
          </div>
        </AuthLayout>
      </>
    );
  }

  return (
    <>
      <PageTitle title={t("auth:twoFactor.pageTitle")} />
      <AuthLayout
        title={t("auth:twoFactor.title")}
        subtitle={
          useBackupCode
            ? t("auth:twoFactor.backupSubtitle")
            : t("auth:twoFactor.subtitle")
        }
      >
        <div className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {useBackupCode ? (
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium sr-only">
                        {t("auth:twoFactor.backupCodeLabel")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t(
                            "auth:twoFactor.backupCodePlaceholder",
                          )}
                          autoComplete="off"
                          autoFocus
                          {...field}
                        />
                      </FormControl>
                      <FormMessage>{fieldState.error?.message}</FormMessage>
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium sr-only">
                        {t("auth:twoFactor.codeLabel")}
                      </FormLabel>
                      <FormControl>
                        <InputOTP
                          maxLength={6}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          pattern={REGEXP_ONLY_DIGITS}
                          autoComplete="one-time-code"
                          inputMode="numeric"
                          name="one-time-code"
                        >
                          <InputOTPGroup className="grid w-full grid-cols-6 gap-1.5">
                            <InputOTPSlot className="h-11 w-full" index={0} />
                            <InputOTPSlot className="h-11 w-full" index={1} />
                            <InputOTPSlot className="h-11 w-full" index={2} />
                            <InputOTPSlot className="h-11 w-full" index={3} />
                            <InputOTPSlot className="h-11 w-full" index={4} />
                            <InputOTPSlot className="h-11 w-full" index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </FormControl>
                      <FormMessage>{fieldState.error?.message}</FormMessage>
                    </FormItem>
                  )}
                />
              )}

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending
                  ? t("auth:twoFactor.verifying")
                  : t("auth:twoFactor.verify")}
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => history.push(signInPath)}
                  className="w-full"
                >
                  <ArrowLeft className="size-4" />
                  {t("auth:twoFactor.backToSignIn")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={toggleMode}
                  disabled={isPending}
                  className="w-full"
                >
                  {useBackupCode ? (
                    <Smartphone className="size-4" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  {useBackupCode
                    ? t("auth:twoFactor.useAuthenticatorCode")
                    : t("auth:twoFactor.useBackupCode")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </AuthLayout>
    </>
  );
}
