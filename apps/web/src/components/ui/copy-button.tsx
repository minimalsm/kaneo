import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    onCopied();
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
