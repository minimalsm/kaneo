import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

type CopyButtonProps = {
  text: string;
  copied: boolean;
  onCopied: () => void;
  copyLabel: string;
  copiedLabel: string;
};

export function CopyButton({
  text,
  copied,
  onCopied,
  copyLabel,
  copiedLabel,
}: CopyButtonProps) {
  const { t } = useTranslation();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      onCopied();
    } catch {
      toast.error(t("common:actions.copyFailed"));
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-7 gap-1.5 text-xs"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-success-foreground" />
          {copiedLabel}
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          {copyLabel}
        </>
      )}
    </Button>
  );
}
