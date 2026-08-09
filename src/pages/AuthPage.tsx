import { ArrowRight, Check, LockKeyhole, Server, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ApiError } from "../lib/api";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login, register, registrationOpen } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isRegister) await register({ email, displayName, password });
      else await login(email, password);
      navigate("/", { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to connect to Vaultboard.");
    } finally {
      setBusy(false);
    }
  };

  const registrationClosed = isRegister && registrationOpen === false;
  return (
    <main className="auth-layout">
      <section className="auth-showcase">
        <div className="auth-brand"><div className="brand-mark light"><span>V</span></div><strong>Vaultboard</strong></div>
        <div className="showcase-copy">
          <span className="auth-kicker"><ShieldCheck size={15} /> Private by design</span>
          <h1>Your infrastructure,<br /><em>beautifully organized.</em></h1>
          <p>Keep every server, service, endpoint, and operational note in one calm, self-hosted workspace.</p>
          <div className="auth-benefits">
            <span><Check size={15} /> Your data stays on your server</span>
            <span><Check size={15} /> Fast search across your entire stack</span>
            <span><Check size={15} /> Built for daily infrastructure work</span>
          </div>
        </div>
        <div className="showcase-visual" aria-hidden="true">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="visual-card card-server"><Server size={22} /><span><small>Core server</small><b>edge-01</b></span><i /></div>
          <div className="visual-card card-security"><LockKeyhole size={20} /><span><small>Session</small><b>Encrypted</b></span></div>
          <div className="visual-node node-one" /><div className="visual-node node-two" /><div className="visual-node node-three" />
        </div>
        <small className="auth-footer">Self-hosted · Open architecture · SQLite powered</small>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-auth-brand"><div className="brand-mark"><span>V</span></div><strong>Vaultboard</strong></div>
          {registrationClosed ? (
            <div className="registration-closed">
              <div className="state-icon"><LockKeyhole size={24} /></div>
              <h2>Registration is closed</h2>
              <p>This Vaultboard already has an owner. Ask your administrator to enable additional registrations.</p>
              <Link className="button primary full-width" to="/login">Return to sign in</Link>
            </div>
          ) : (
            <>
              <div className="auth-heading">
                <span className="eyebrow">{isRegister ? "First-time setup" : "Welcome back"}</span>
                <h2>{isRegister ? "Create your Vaultboard" : "Sign in to Vaultboard"}</h2>
                <p>{isRegister ? "Create the owner account for this installation." : "Enter your account details to continue."}</p>
              </div>
              <form className="auth-form" onSubmit={submit}>
                {error && <div className="form-alert" role="alert">{error}</div>}
                {isRegister && (
                  <label className="field">
                    <span>Your name</span>
                    <input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Alex Morgan" required maxLength={80} autoComplete="name" />
                  </label>
                )}
                <label className="field">
                  <span>Email address</span>
                  <input autoFocus={!isRegister} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" maxLength={254} autoComplete="email" />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? "At least 12 characters" : "Your password"} required type="password" minLength={isRegister ? 12 : 1} maxLength={128} autoComplete={isRegister ? "new-password" : "current-password"} />
                  {isRegister && <small>Use 12+ characters with at least one letter and number.</small>}
                </label>
                <button className="button primary auth-submit" disabled={busy}>
                  {busy ? <span className="button-spinner" /> : <>{isRegister ? "Create Vaultboard" : "Sign in"}<ArrowRight size={17} /></>}
                </button>
              </form>
              <p className="auth-switch">
                {isRegister ? <>Already configured? <Link to="/login">Sign in</Link></> : registrationOpen ? <>New installation? <Link to="/register">Create the owner account</Link></> : <>Need access? Contact your Vaultboard administrator.</>}
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
