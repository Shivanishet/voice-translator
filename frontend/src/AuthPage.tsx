import { useState } from "react";
import type { FormEvent } from "react";
import { login, signUp } from "./authService";

type AuthPageProps = {
  mode: "login" | "signup";
  onModeChange: (mode: "login" | "signup") => void;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPage({ mode, onModeChange }: AuthPageProps) {
  const isSignup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const normalizedEmail = email.trim();
    if (!emailPattern.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (isSignup && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      if (isSignup) {
        await signUp(normalizedEmail, password);
      } else {
        await login(normalizedEmail, password);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-kicker">AI Voice Translator</p>
        <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-subtitle">
          {isSignup ? "Save your translations privately." : "Sign in to continue translating."}
        </p>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isSignup ? "new-password" : "current-password"} required />
          {isSignup && (
            <>
              <label htmlFor="auth-confirm-password">Confirm password</label>
              <input id="auth-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
            </>
          )}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="btn auth-submit" type="submit" disabled={loading}>
            {loading ? (isSignup ? "Creating account..." : "Signing in...") : (isSignup ? "Create account" : "Log in")}
          </button>
        </form>
        <p className="auth-switch">
          {isSignup ? "Already have an account?" : "New to the translator?"}{" "}
          <button type="button" onClick={() => onModeChange(isSignup ? "login" : "signup")}>
            {isSignup ? "Log in" : "Sign up"}
          </button>
        </p>
      </section>
    </main>
  );
}