import { useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

export function LoginForm() {
  const [mode, setMode]         = useState("signin");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [info, setInfo]         = useState("");
  const [focused, setFocused]   = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setInfo(""); setLoading(true);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setInfo("Conta criada! Verifique seu e-mail antes de entrar.");
      }
    } catch (err) {
      setError(err.message || "Não foi possível autenticar.");
    } finally {
      setLoading(false);
    }
  }

  const inputBase = (name) => ({
    background: focused === name ? "rgba(224,191,76,0.04)" : "rgba(255,255,255,0.03)",
    border: `1px solid ${focused === name ? "rgba(224,191,76,0.45)" : "rgba(255,255,255,0.07)"}`,
    borderRadius: 12,
    padding: "13px 16px",
    color: "#E4EAF4",
    fontSize: 14,
    outline: "none",
    width: "100%",
    fontFamily: "inherit",
    transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
    boxShadow: focused === name ? "0 0 0 3px rgba(224,191,76,0.07)" : "none",
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070A12",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Poppins', 'Inter', system-ui, sans-serif",
    }}>

      {/* ── Background atmosphere ── */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* grid mesh */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
        }} />
        {/* navy top glow */}
        <div style={{
          position: "absolute", top: -240, left: "50%", transform: "translateX(-50%)",
          width: 900, height: 700,
          background: "radial-gradient(ellipse, rgba(11,37,69,0.85) 0%, transparent 70%)",
        }} />
        {/* gold top-right orb */}
        <div style={{
          position: "absolute", top: -80, right: -80,
          width: 440, height: 440, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(224,191,76,0.10) 0%, transparent 65%)",
        }} />
        {/* navy bottom-left orb */}
        <div style={{
          position: "absolute", bottom: -120, left: -80,
          width: 420, height: 420, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(11,37,69,0.5) 0%, transparent 70%)",
        }} />
      </div>

      {/* ── Main content ── */}
      <div className="scale-in" style={{
        position: "relative", zIndex: 1,
        width: "100%", maxWidth: 400,
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>

        {/* Logo block */}
        <div style={{ marginBottom: 44, textAlign: "center" }}>
          <div style={{
            width: 76, height: 76, borderRadius: 22,
            background: "linear-gradient(145deg, #0D2040 0%, #091729 100%)",
            border: "1px solid rgba(224,191,76,0.22)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(224,191,76,0.06), 0 0 70px rgba(224,191,76,0.06), inset 0 1px 0 rgba(255,255,255,0.09)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 22px",
          }}>
            <svg viewBox="0 0 200 200" width="44" height="44" fill="none">
              <rect x="12"  y="120" width="38" height="68"  rx="8" fill="white" opacity="0.55"/>
              <rect x="79"  y="90"  width="38" height="98"  rx="8" fill="white" opacity="0.78"/>
              <rect x="146" y="52"  width="38" height="136" rx="8" fill="white"/>
              <circle cx="165" cy="32" r="20" fill="#E0BF4C"/>
            </svg>
          </div>

          <h1 style={{ fontSize: 27, fontWeight: 700, color: "#E4EAF4", margin: "0 0 5px", letterSpacing: "-0.03em" }}>
            Atlas <span style={{ color: "#E0BF4C", fontWeight: 400 }}>Gestão</span>
          </h1>
          <p style={{ fontSize: 13, color: "#3D5470", margin: 0, letterSpacing: "0.01em" }}>
            {mode === "signin" ? "Bem-vindo de volta" : "Crie sua conta gratuitamente"}
          </p>
        </div>

        {/* Glass card */}
        <form
          onSubmit={handleSubmit}
          style={{
            width: "100%",
            background: "rgba(11,16,28,0.75)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 22,
            padding: "32px 28px 28px",
            boxShadow: "0 32px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)",
            display: "flex", flexDirection: "column", gap: 14,
          }}
        >
          {/* Top inner shimmer */}
          <div style={{
            position: "absolute", left: 40, right: 40, top: 0, height: 1,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
            borderRadius: 1,
          }} />

          <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 10, fontWeight: 700, color: "#2E4560", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            E-mail
            <input
              type="email" required value={email} autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
              style={{ ...inputBase("email"), textTransform: "none", letterSpacing: "normal" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 10, fontWeight: 700, color: "#2E4560", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Senha
            <input
              type="password" required value={password} minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
              style={{ ...inputBase("password"), textTransform: "none", letterSpacing: "normal" }}
            />
          </label>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.09)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 14px", color: "#EF4444", fontSize: 13, lineHeight: 1.4 }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{ background: "rgba(224,191,76,0.07)", border: "1px solid rgba(224,191,76,0.2)", borderRadius: 10, padding: "10px 14px", color: "#E0BF4C", fontSize: 13, lineHeight: 1.4 }}>
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? "rgba(224,191,76,0.55)" : "linear-gradient(135deg, #E8CC5A 0%, #C9A227 100%)",
              color: "#07100A",
              border: "none",
              borderRadius: 12,
              padding: "14px 0",
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              marginTop: 6,
              boxShadow: loading ? "none" : "0 4px 24px rgba(224,191,76,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
              transition: "all 0.2s",
              fontFamily: "inherit",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.boxShadow = "0 6px 32px rgba(224,191,76,0.5), inset 0 1px 0 rgba(255,255,255,0.2)"; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.boxShadow = "0 4px 24px rgba(224,191,76,0.35), inset 0 1px 0 rgba(255,255,255,0.2)"; }}
          >
            {loading ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
          </button>

          <button
            type="button"
            onClick={() => { setMode(m => m === "signin" ? "signup" : "signin"); setError(""); setInfo(""); }}
            style={{ background: "none", border: "none", color: "#2E4560", fontSize: 13, cursor: "pointer", transition: "color 0.15s", fontFamily: "inherit", paddingTop: 2 }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#E0BF4C"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#2E4560"}
          >
            {mode === "signin" ? "Não tem conta? Criar uma agora" : "Já tem conta? Entrar"}
          </button>
        </form>

        <p style={{ marginTop: 28, fontSize: 11, color: "#1A2A3A", letterSpacing: "0.04em" }}>
          Atlas Gestão · Plataforma de gestão integrada
        </p>
      </div>
    </div>
  );
}
