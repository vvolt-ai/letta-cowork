import { useEffect, useState } from "react";

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

interface WorkspaceOption {
  id: string;
  name: string;
}

// Helper to access API methods
const getApi = () => (window as any).electron;

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState<"new" | "existing">("new");
  const [organizationId, setOrganizationId] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "register" || workspaceMode !== "existing") {
      return;
    }

    let cancelled = false;

    const loadWorkspaces = async () => {
      setWorkspacesLoading(true);
      setWorkspacesError(null);

      try {
        const api = getApi();
        const result = await api.apiListWorkspaces();

        if (cancelled) {
          return;
        }

        if (result.success) {
          const nextWorkspaces = result.workspaces ?? [];
          setWorkspaces(nextWorkspaces);

          if (organizationId && !nextWorkspaces.some((workspace: WorkspaceOption) => workspace.id === organizationId)) {
            setOrganizationId("");
          }
        } else {
          setWorkspacesError(result.error || "Failed to load workspaces");
        }
      } catch (err) {
        if (!cancelled) {
          setWorkspacesError(err instanceof Error ? err.message : "Failed to load workspaces");
        }
      } finally {
        if (!cancelled) {
          setWorkspacesLoading(false);
        }
      }
    };

    loadWorkspaces();

    return () => {
      cancelled = true;
    };
  }, [mode, workspaceMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    console.log(`[LoginScreen] Attempting ${mode}...`);
    console.log('[LoginScreen] Email:', email);

    try {
      const api = getApi();
      if (mode === "login") {
        if (!otpSent) {
          console.log('[LoginScreen] Requesting email OTP...');
          const result = await api.apiRequestEmailOtp(email);
          if (result.success) {
            setOtpSent(true);
          } else {
            setError(result.error || "Failed to send login code");
          }
          return;
        }

        console.log('[LoginScreen] Verifying email OTP...');
        const result = await api.apiVerifyEmailOtp(email, otp);
        console.log('[LoginScreen] OTP login result:', result);
        if (result.success) {
          console.log('[LoginScreen] Login successful, user:', result.user);
          onLoginSuccess();
        } else {
          console.error('[LoginScreen] Login failed:', result.error);
          setError(result.error || "Login failed");
        }
      } else {
        const normalizedPhoneNumber = phoneNumber.trim();
        console.log('[LoginScreen] Calling apiRegister...');
        const result = await api.apiRegister({
          email,
          password,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          phoneNumber: normalizedPhoneNumber,
          organizationId: workspaceMode === "existing" ? organizationId.trim() || undefined : undefined,
        });
        console.log('[LoginScreen] Register result:', result);
        if (result.success) {
          console.log('[LoginScreen] Registration successful, user:', result.user);
          onLoginSuccess();
        } else {
          console.error('[LoginScreen] Registration failed:', result.error);
          setError(result.error || "Registration failed");
        }
      }
    } catch (err) {
      console.error('[LoginScreen] Error:', err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const resetLoginCode = () => {
    setOtpSent(false);
    setOtp("");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Vera Cowork</h1>
          <p className="text-slate-500 mt-1">Connect your channels to AI agents</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-6">
            <button
              onClick={() => {
                setMode("login");
                resetLoginCode();
              }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode("register");
                resetLoginCode();
              }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                mode === "register"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Last Name (optional)
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    placeholder="Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    placeholder="+918849286808"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Include country code. A phone number can only be registered once.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Workspace
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setWorkspaceMode("new");
                        setOrganizationId("");
                      }}
                      className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                        workspaceMode === "new"
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      New workspace
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkspaceMode("existing")}
                      className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                        workspaceMode === "existing"
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Join existing
                    </button>
                  </div>
                  {workspaceMode === "existing" && (
                    <>
                      <select
                        value={organizationId}
                        onChange={(e) => setOrganizationId(e.target.value)}
                        required
                        disabled={workspacesLoading}
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <option value="">
                          {workspacesLoading ? "Loading workspaces..." : "Select workspace"}
                        </option>
                        {workspaces.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </option>
                        ))}
                      </select>
                      {workspacesError ? (
                        <p className="text-xs text-red-600 mt-1">{workspacesError}</p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-1">
                          Select the workspace you want to join.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (mode === "login") resetLoginCode();
                }}
                required
                disabled={mode === "login" && otpSent}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                placeholder="you@example.com"
              />
            </div>

            {mode === "login" && otpSent && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Login code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  minLength={6}
                  maxLength={6}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all tracking-[0.5em] font-mono text-center"
                  placeholder="123456"
                  autoFocus
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-slate-500">Check your email. Code expires in 10 minutes.</p>
                  <button type="button" onClick={resetLoginCode} className="text-xs text-blue-600 hover:text-blue-700">
                    Change email
                  </button>
                </div>
              </div>
            )}

            {mode === "register" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                placeholder="Minimum 12 characters"
              />
              {mode === "register" && password.length > 0 && password.length < 12 && (
                <p className="text-xs text-amber-600 mt-1">
                  Password must be at least 12 characters ({12 - password.length} more needed)
                </p>
              )}
            </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || workspacesLoading || !email || (mode === "login" && otpSent && otp.length !== 6) || (mode === "register" && (!password || !firstName || !phoneNumber.trim() || password.length < 12 || (workspaceMode === "existing" && !organizationId)))}
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle className="opacity-25" cx="12" cy="12" r="10" />
                    <path className="opacity-75" d="M4 12a8 8 0 018-8" />
                  </svg>
                  {mode === "login" ? (otpSent ? "Verifying..." : "Sending code...") : "Creating account..."}
                </span>
              ) : (
                mode === "login" ? (otpSent ? "Verify & Sign In" : "Send Login Code") : "Create Account"
              )}
            </button>
          </form>

          {/* API URL */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              API Server
            </label>
            <input
              type="text"
              defaultValue="https://vera-cowork-server.ngrok.app"
              onChange={async (e) => {
                const api = getApi();
                await api.apiSetUrl(e.target.value);
              }}
              className="w-full px-3 py-1.5 rounded border border-slate-200 text-xs text-slate-600 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by Letta AI
        </p>
      </div>
    </div>
  );
}
