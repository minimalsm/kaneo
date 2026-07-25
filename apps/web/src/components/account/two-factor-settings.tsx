import { Check, Copy, Download, ShieldCheck, ShieldOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFrame,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";

type PasswordAction = "enable" | "disable" | "regenerate";

type Enrollment = {
  totpURI: string;
  backupCodes: string[];
};

function getSecretFromTotpUri(totpURI: string) {
  try {
    const url = new URL(totpURI);
    return url.searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

type PasswordDialogProps = {
  action: PasswordAction;
  onClose: () => void;
  onConfirm: (password: string) => Promise<string | null>;
};

function PasswordDialog({ action, onClose, onConfirm }: PasswordDialogProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titles: Record<PasswordAction, string> = {
    enable: t("settings:twoFactor.passwordDialog.enableTitle"),
    disable: t("settings:twoFactor.passwordDialog.disableTitle"),
    regenerate: t("settings:twoFactor.passwordDialog.regenerateTitle"),
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError(t("settings:twoFactor.passwordDialog.passwordRequired"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const errorMessage = await onConfirm(password);
    setIsSubmitting(false);
    if (errorMessage) {
      setError(errorMessage);
    }
  };

  return (
    <Dialog open onOpenChange={() => !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titles[action]}</DialogTitle>
          <DialogDescription>
            {t("settings:twoFactor.passwordDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-2 px-6 py-4">
            <Label htmlFor={inputId}>
              {t("settings:twoFactor.passwordDialog.passwordLabel")}
            </Label>
            <Input
              id={inputId}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t(
                "settings:twoFactor.passwordDialog.passwordPlaceholder",
              )}
              disabled={isSubmitting}
            />
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t("settings:twoFactor.passwordDialog.confirming")
                : t("settings:twoFactor.passwordDialog.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type BackupCodesModalProps = {
  backupCodes: string[];
  onClose: () => void;
};

function BackupCodesModal({ backupCodes, onClose }: BackupCodesModalProps) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setSaved(true);
    toast.success(t("settings:twoFactor.backupCodesModal.toastCopied"));
  };

  const handleDownload = () => {
    const blob = new Blob([`${backupCodes.join("\n")}\n`], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kaneo-backup-codes.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSaved(true);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[446px]">
        <DialogHeader>
          <DialogTitle>
            {t("settings:twoFactor.backupCodesModal.title")}
          </DialogTitle>
          <DialogDescription>
            {t("settings:twoFactor.backupCodesModal.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">
                {t("settings:twoFactor.backupCodesModal.yourCodes")}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-7 gap-1.5 text-xs"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-success-foreground" />
                      {t("settings:twoFactor.backupCodesModal.copied")}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      {t("settings:twoFactor.backupCodesModal.copy")}
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Download className="h-3 w-3" />
                  {t("settings:twoFactor.backupCodesModal.download")}
                </Button>
              </div>
            </div>
            <div className="bg-sidebar border border-border rounded-sm p-2.5 max-h-40 overflow-y-auto">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {backupCodes.map((code) => (
                  <code
                    key={code}
                    className="text-xs font-mono text-foreground break-all leading-relaxed"
                  >
                    {code}
                  </code>
                ))}
              </div>
            </div>
          </div>

          <Alert>
            <AlertTitle>
              {t("settings:twoFactor.backupCodesModal.alertTitle")}
            </AlertTitle>
            <AlertDescription>
              {t("settings:twoFactor.backupCodesModal.alertDescription")}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            onClick={onClose}
            disabled={!saved}
            className="h-8 text-xs w-full sm:w-auto"
          >
            {saved
              ? t("settings:twoFactor.backupCodesModal.done")
              : t("settings:twoFactor.backupCodesModal.saveToContinue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TwoFactorSettings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const codeInputId = useId();

  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const [passwordAction, setPasswordAction] = useState<PasswordAction | null>(
    null,
  );
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const isEnabled =
    enabledOverride ??
    Boolean((user as { twoFactorEnabled?: boolean } | null)?.twoFactorEnabled);

  const secret = useMemo(
    () => (enrollment ? getSecretFromTotpUri(enrollment.totpURI) : ""),
    [enrollment],
  );

  if (!user || (user as { isAnonymous?: boolean }).isAnonymous) {
    return null;
  }

  const clearEnrollment = () => {
    setEnrollment(null);
    setVerifyCode("");
    setVerifyError(null);
    setSecretCopied(false);
  };

  const handlePasswordConfirm = async (
    password: string,
  ): Promise<string | null> => {
    if (passwordAction === "enable") {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error || !data) {
        return (
          error?.message ||
          t("settings:twoFactor.passwordDialog.invalidPassword")
        );
      }
      setEnrollment({
        totpURI: data.totpURI,
        backupCodes: data.backupCodes,
      });
      setPasswordAction(null);
      return null;
    }

    if (passwordAction === "disable") {
      const { error } = await authClient.twoFactor.disable({ password });
      if (error) {
        return (
          error.message ||
          t("settings:twoFactor.passwordDialog.invalidPassword")
        );
      }
      setEnabledOverride(false);
      setPasswordAction(null);
      toast.success(t("settings:twoFactor.toast.disabled"));
      return null;
    }

    const { data, error } = await authClient.twoFactor.generateBackupCodes({
      password,
    });
    if (error || !data) {
      return (
        error?.message || t("settings:twoFactor.passwordDialog.invalidPassword")
      );
    }
    setPasswordAction(null);
    setBackupCodes(data.backupCodes);
    return null;
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!enrollment) return;
    if (verifyCode.length !== 6) {
      setVerifyError(t("settings:twoFactor.qrStep.codeLength"));
      return;
    }
    setIsVerifying(true);
    setVerifyError(null);
    const { error } = await authClient.twoFactor.verifyTotp({
      code: verifyCode,
    });
    setIsVerifying(false);
    if (error) {
      setVerifyError(
        error.message || t("settings:twoFactor.qrStep.invalidCode"),
      );
      return;
    }
    const codes = enrollment.backupCodes;
    clearEnrollment();
    setEnabledOverride(true);
    setBackupCodes(codes);
    toast.success(t("settings:twoFactor.toast.enabled"));
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret);
    setSecretCopied(true);
    toast.success(t("settings:twoFactor.qrStep.secretCopied"));
  };

  return (
    <>
      <CardFrame>
        <Card className="!rounded-none !border-t-0">
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" />
              {t("settings:twoFactor.cardTitle")}
              <Badge variant={isEnabled ? "default" : "outline"}>
                {isEnabled
                  ? t("settings:twoFactor.statusEnabled")
                  : t("settings:twoFactor.statusDisabled")}
              </Badge>
            </CardTitle>
            <CardDescription>
              {t("settings:twoFactor.cardDescription")}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="!rounded-none">
          <CardPanel className="p-4">
            {enrollment ? (
              <div className="space-y-4 max-w-md">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {t("settings:twoFactor.qrStep.title")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:twoFactor.qrStep.description")}
                  </p>
                </div>

                <div className="inline-block rounded-md border border-border bg-white p-3">
                  <QRCodeSVG value={enrollment.totpURI} size={168} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">
                      {t("settings:twoFactor.qrStep.secretLabel")}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopySecret}
                      className="h-7 gap-1.5 text-xs"
                    >
                      {secretCopied ? (
                        <>
                          <Check className="h-3 w-3 text-success-foreground" />
                          {t("settings:twoFactor.qrStep.secretCopiedLabel")}
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          {t("settings:twoFactor.qrStep.copySecret")}
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="bg-sidebar border border-border rounded-sm p-2.5">
                    <code className="text-xs font-mono text-foreground break-all leading-relaxed">
                      {secret}
                    </code>
                  </div>
                </div>

                <form onSubmit={handleVerify} className="space-y-2">
                  <Label htmlFor={codeInputId}>
                    {t("settings:twoFactor.qrStep.codeLabel")}
                  </Label>
                  <Input
                    id={codeInputId}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(event) =>
                      setVerifyCode(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder={t("settings:twoFactor.qrStep.codePlaceholder")}
                    disabled={isVerifying}
                    className="max-w-40"
                  />
                  {verifyError && (
                    <p role="alert" className="text-xs text-destructive">
                      {verifyError}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Button type="submit" disabled={isVerifying}>
                      {isVerifying
                        ? t("settings:twoFactor.qrStep.verifying")
                        : t("settings:twoFactor.qrStep.verify")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={clearEnrollment}
                      disabled={isVerifying}
                    >
                      {t("common:actions.cancel")}
                    </Button>
                  </div>
                </form>
              </div>
            ) : isEnabled ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPasswordAction("regenerate")}
                >
                  {t("settings:twoFactor.regenerateBackupCodes")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setPasswordAction("disable")}
                >
                  <ShieldOff className="size-4" />
                  {t("settings:twoFactor.disable")}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("settings:twoFactor.disabledHint")}
                </p>
                <Button onClick={() => setPasswordAction("enable")}>
                  <ShieldCheck className="size-4" />
                  {t("settings:twoFactor.enable")}
                </Button>
              </div>
            )}
          </CardPanel>
        </Card>
      </CardFrame>

      {passwordAction && (
        <PasswordDialog
          action={passwordAction}
          onClose={() => setPasswordAction(null)}
          onConfirm={handlePasswordConfirm}
        />
      )}

      {backupCodes && (
        <BackupCodesModal
          backupCodes={backupCodes}
          onClose={() => setBackupCodes(null)}
        />
      )}
    </>
  );
}

export default TwoFactorSettings;
