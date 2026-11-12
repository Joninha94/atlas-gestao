import { useEffect, useState } from "react";
import { Repeat } from "lucide-react";
import { COLORS } from "../constants/colors.js";
import { supabase } from "../lib/supabaseClient.js";
import { LoginForm } from "./LoginForm.jsx";

// Garante que nada do app renderiza sem uma sessão Supabase válida — é o que
// permite confiar em auth.uid() nas policies de RLS. Re-renderiza sempre que
// o usuário faz login/logout, sem precisar recarregar a página.
export function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = ainda checando
  const [sessionError, setSessionError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    const timeoutId = window.setTimeout(() => {
      if (active) {
        setSessionError("O servidor de autenticação não respondeu. Verifique sua conexão e tente novamente.");
      }
    }, 15000);

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      window.clearTimeout(timeoutId);
      setSessionError("");
      setSession(newSession);
    });

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        window.clearTimeout(timeoutId);
        if (error) {
          setSessionError(error.message || "Não foi possível verificar sua sessão.");
          return;
        }
        setSessionError("");
        setSession(data.session);
      })
      .catch((error) => {
        if (!active) return;
        window.clearTimeout(timeoutId);
        setSessionError(error instanceof Error ? error.message : "Não foi possível verificar sua sessão.");
      });

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      subscription.subscription.unsubscribe();
    };
  }, [retryCount]);

  if (sessionError) {
    return (
      <div style={{
        background: COLORS.bg, minHeight: "100vh", color: COLORS.inkMuted, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 24,
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
      }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <p style={{ color: COLORS.ink, fontSize: 16, marginBottom: 8 }}>
            Não foi possível conectar ao Atlas.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
            {sessionError}
          </p>
          <button
            type="button"
            onClick={() => {
              setSession(undefined);
              setSessionError("");
              setRetryCount((count) => count + 1);
            }}
            style={{
              background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8,
              padding: "10px 16px", color: COLORS.ink, cursor: "pointer", fontSize: 14,
            }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return (
      <div style={{
        background: COLORS.bg, minHeight: "100vh", color: COLORS.inkMuted, display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
          <Repeat size={16} className="spin-icon" />
          Abrindo o Atlas...
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

  return children(session);
}
