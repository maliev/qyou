import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { Loader2, Shield } from "lucide-react";
import { isAxiosError } from "axios";

const loginSchema = z.object({
  login: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { login, validate2FA } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  // Rate limit state
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (rateLimitSeconds > 0) {
      timerRef.current = setInterval(() => {
        setRateLimitSeconds((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [rateLimitSeconds]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const result = await login(data.login, data.password);

      if (result && result.requires2FA) {
        setNeeds2FA(true);
        setTempToken(result.tempToken ?? null);
        setUserId(result.userId ?? null);
      } else {
        navigate("/");
      }
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response) {
        const status = err.response.status;
        if (status === 429) {
          const retryAfter = err.response.data?.retryAfter || 30;
          setRateLimitSeconds(retryAfter);
          setAuthError(`Too many attempts. Please wait ${retryAfter} seconds.`);
        } else if (status === 401) {
          setAuthError("Invalid email or password");
        } else {
          setAuthError(err.response.data?.message || "Login failed");
        }
      } else {
        toast.error("Network error. Please check your connection and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FASubmit = async () => {
    if (!tempToken || !userId || totpCode.length < 6) return;
    setIsLoading(true);
    setAuthError(null);
    try {
      await validate2FA(userId, totpCode, tempToken);
      navigate("/");
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response) {
        setAuthError(err.response.data?.message || "Invalid 2FA code");
      } else {
        toast.error("Network error. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 2FA verification step
  if (needs2FA) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Shield className="h-5 w-5" />
          <p className="text-sm font-medium">Two-Factor Authentication</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Enter the code from your authenticator app
        </p>
        <div className="space-y-2">
          <Label htmlFor="totp-code">Authenticator code</Label>
          <Input
            id="totp-code"
            type="text"
            inputMode="numeric"
            maxLength={8}
            placeholder="000000"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            className="text-center text-lg tracking-widest font-mono"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handle2FASubmit();
            }}
          />
          <p className="text-xs text-muted-foreground">
            Or enter a backup code
          </p>
        </div>

        {authError && (
          <p className="text-sm text-destructive">{authError}</p>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 min-h-[44px]"
            onClick={() => {
              setNeeds2FA(false);
              setTotpCode("");
              setAuthError(null);
            }}
          >
            Back
          </Button>
          <Button
            className="flex-1 min-h-[44px]"
            onClick={handle2FASubmit}
            disabled={isLoading || totpCode.length < 6}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login">Email or username</Label>
        <Input
          id="login"
          type="text"
          placeholder="you@example.com"
          className="text-base"
          {...register("login")}
        />
        {errors.login && (
          <p className="text-sm text-destructive">{errors.login.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Enter your password"
          className="text-base"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>

      {authError && (
        <p className="text-sm text-destructive">{authError}</p>
      )}

      {rateLimitSeconds > 0 && (
        <p className="text-sm text-muted-foreground">
          Please wait {rateLimitSeconds}s before trying again
        </p>
      )}

      <Button
        type="submit"
        className="w-full min-h-[44px]"
        disabled={isLoading || rateLimitSeconds > 0}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
