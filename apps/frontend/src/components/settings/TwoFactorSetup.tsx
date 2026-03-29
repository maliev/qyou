import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, ShieldCheck, ShieldOff, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { TwoFactorSetupResponse } from "@/types";

interface TwoFactorSetupProps {
  enabled: boolean;
  onStatusChange: () => void;
}

type Step = "intro" | "scan" | "verify" | "backup" | "disable";

export function TwoFactorSetup({ enabled, onStatusChange }: TwoFactorSetupProps) {
  const [step, setStep] = useState<Step>("intro");
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupsSaved, setBackupsSaved] = useState(false);

  // Disable state
  const [disableCode, setDisableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");

  const handleStartSetup = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.post<TwoFactorSetupResponse>("/auth/2fa/setup");
      setSetupData(data);
      setStep("scan");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to start 2FA setup";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (verifyCode.length !== 6) {
      setError("Enter a 6-digit code");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await api.post("/auth/2fa/verify-setup", { token: verifyCode });
      setStep("backup");
      toast.success("2FA enabled successfully");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Invalid code";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadBackupCodes = () => {
    if (!setupData) return;
    const content = [
      "Qyou Backup Codes",
      "==================",
      "Each code can only be used once.",
      "",
      ...setupData.backupCodes.map((code, i) => `${i + 1}. ${code}`),
      "",
      `Generated: ${new Date().toISOString()}`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qyou-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDone = () => {
    setStep("intro");
    setSetupData(null);
    setVerifyCode("");
    setBackupsSaved(false);
    onStatusChange();
  };

  const handleStartDisable = () => {
    setStep("disable");
    setError(null);
    setDisableCode("");
    setDisablePassword("");
  };

  const handleDisable = async () => {
    if (!disableCode || !disablePassword) {
      setError("Both fields are required");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await api.post("/auth/2fa/disable", {
        token: disableCode,
        password: disablePassword,
      });
      toast.success("2FA disabled");
      setStep("intro");
      onStatusChange();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to disable 2FA";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setStep("intro");
    setError(null);
    setSetupData(null);
    setVerifyCode("");
    setDisableCode("");
    setDisablePassword("");
  };

  // Intro state
  if (step === "intro") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {enabled ? (
            <ShieldCheck className="h-5 w-5 text-green-500" />
          ) : (
            <Shield className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium">
              Two-Factor Authentication
            </p>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? "2FA is enabled on your account"
                : "Add an extra layer of security to your account"}
            </p>
          </div>
        </div>
        {enabled ? (
          <Button variant="destructive" size="sm" onClick={handleStartDisable}>
            <ShieldOff className="mr-2 h-4 w-4" />
            Disable 2FA
          </Button>
        ) : (
          <Button size="sm" onClick={handleStartSetup} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Shield className="mr-2 h-4 w-4" />
            )}
            Set up 2FA
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // Scan QR code
  if (step === "scan") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium">Scan QR Code</p>
        <p className="text-xs text-muted-foreground">
          Scan this with Google Authenticator, Authy, or any TOTP app
        </p>
        {setupData && (
          <>
            <div className="flex justify-center">
              <img
                src={setupData.qrCodeUrl}
                alt="TOTP QR Code"
                className="h-48 w-48 rounded-lg border"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Manual entry key:
              </p>
              <code className="block rounded bg-muted px-3 py-2 text-xs font-mono break-all select-all">
                {setupData.secret}
              </code>
            </div>
          </>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => setStep("verify")}>
            Next — I've scanned it
          </Button>
        </div>
      </div>
    );
  }

  // Verify code
  if (step === "verify") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium">Verify Setup</p>
        <p className="text-xs text-muted-foreground">
          Enter the 6-digit code from your authenticator app
        </p>
        <div className="space-y-2">
          <Label htmlFor="totp-verify">Verification code</Label>
          <Input
            id="totp-verify"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-lg tracking-widest font-mono"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setStep("scan")}>
            Back
          </Button>
          <Button size="sm" onClick={handleVerify} disabled={isLoading || verifyCode.length !== 6}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Verify
          </Button>
        </div>
      </div>
    );
  }

  // Backup codes
  if (step === "backup") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium">Save Your Backup Codes</p>
        <p className="text-xs text-muted-foreground">
          Save these somewhere safe — each can only be used once
        </p>
        {setupData && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted p-4">
            {setupData.backupCodes.map((code, i) => (
              <code key={i} className="text-xs font-mono text-center py-1">
                {code}
              </code>
            ))}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleDownloadBackupCodes}
        >
          <Download className="mr-2 h-4 w-4" />
          Download as .txt
        </Button>
        <div className="flex items-center gap-2">
          <Checkbox
            id="backup-saved"
            checked={backupsSaved}
            onCheckedChange={(checked) => setBackupsSaved(checked === true)}
          />
          <Label htmlFor="backup-saved" className="text-xs">
            I've saved my backup codes
          </Label>
        </div>
        <Button size="sm" onClick={handleDone} disabled={!backupsSaved}>
          Done
        </Button>
      </div>
    );
  }

  // Disable 2FA
  if (step === "disable") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium">Disable Two-Factor Authentication</p>
        <p className="text-xs text-muted-foreground">
          Enter your authenticator code and password to disable 2FA
        </p>
        <div className="space-y-2">
          <Label htmlFor="disable-code">Authenticator code or backup code</Label>
          <Input
            id="disable-code"
            type="text"
            placeholder="000000"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            className="font-mono"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="disable-password">Password</Label>
          <Input
            id="disable-password"
            type="password"
            placeholder="Enter your password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDisable}
            disabled={isLoading || !disableCode || !disablePassword}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Disable 2FA
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
