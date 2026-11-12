import { Check, ChevronRight, TrendingUp } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { inputStyle } from "../../styles/shared.js";

// ── TabButton ─────────────────────────────────────────────────────────────────
export function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      className="tab-btn"
      onClick={onClick}
      style={{
        background: active ? `${COLORS.river}15` : "none",
        border: "none",
        cursor: "pointer",
        padding: "7px 14px",
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 13, fontWeight: 600,
        color: active ? COLORS.river : COLORS.inkMuted,
        borderRadius: 8,
      }}
    >
      {icon} {label}
    </button>
  );
}

// ── ToggleOption ──────────────────────────────────────────────────────────────
export function ToggleOption({ active, onClick, color, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "9px 10px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer",
        border: `1px solid ${active ? color + "60" : COLORS.line}`,
        background: active ? `${color}18` : COLORS.surfaceAlt,
        color: active ? color : COLORS.inkMuted,
        transition: "all 0.15s",
      }}
    >
      {icon} {label}
    </button>
  );
}

// ── PaidStatusToggle ──────────────────────────────────────────────────────────
export function PaidStatusToggle({ checked, onToggle, bankId, onBankChange, banks, label, color }) {
  return (
    <div style={{
      border: `1px solid ${checked ? color + "50" : COLORS.line}`,
      borderRadius: 12,
      padding: "12px 14px",
      background: checked ? `${color}0D` : "transparent",
      transition: "background 0.2s, border-color 0.2s",
    }}>
      <div
        role="button" tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
      >
        <StatusCheckbox checked={checked} onClick={(e) => { e.stopPropagation(); onToggle(); }} color={color} />
        <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{label}</span>
      </div>
      {checked && (
        <div style={{ marginTop: 10 }}>
          {banks.length === 0 ? (
            <p style={{ fontSize: 12, color: COLORS.danger, margin: 0, lineHeight: 1.6 }}>
              Nenhum banco cadastrado. Cadastre um banco para confirmar.
            </p>
          ) : (
            <Field label="De qual banco?">
              <select value={bankId} onChange={(e) => onBankChange(e.target.value)} style={inputStyle}>
                <option value="">Selecione...</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ color, children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color,
      background: `${color}18`,
      borderRadius: 99,
      padding: "2px 7px",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

// ── StatusCheckbox ────────────────────────────────────────────────────────────
export function StatusCheckbox({ checked, onClick, color, disabled }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={checked}
      aria-label={disabled ? "Status definido pela fatura" : checked ? "Marcar como pendente" : "Marcar como concluído"}
      title={disabled ? "Esse status segue o pagamento da fatura inteira" : undefined}
      style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
        cursor: disabled ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1.5px solid ${checked ? color : COLORS.line}`,
        background: checked ? color : "transparent",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.15s",
      }}
    >
      {checked && <Check size={12} color="#07090C" strokeWidth={3} />}
    </button>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────
export function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="card" style={{ padding: "20px 22px", position: "relative", overflow: "hidden" }}>
      {/* Accent glow top-right */}
      <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 80, background: `radial-gradient(circle at top right, ${color}18 0%, transparent 70%)`, pointerEvents: "none" }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", lineHeight: 1 }}>
          {label}
        </span>
        <span style={{ color, opacity: 0.8, flexShrink: 0 }}>{icon}</span>
      </div>

      <div className="ff-display" style={{ fontSize: 26, fontWeight: 700, color: COLORS.ink, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 6 }}>
        {value}
      </div>

      <div style={{ fontSize: 12, color, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
        {sub}
      </div>
    </div>
  );
}

// ── ClickableStatCard ─────────────────────────────────────────────────────────
export function ClickableStatCard({ onClick, icon, label, value, sub, color }) {
  return (
    <button
      onClick={onClick}
      className="card card-hover"
      style={{
        padding: "20px 22px",
        cursor: "pointer", textAlign: "left", width: "100%",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Accent glow */}
      <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 80, background: `radial-gradient(circle at top right, ${color}15 0%, transparent 70%)`, pointerEvents: "none" }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", lineHeight: 1 }}>
          {label}
        </span>
        <span style={{ color, opacity: 0.8, flexShrink: 0 }}>{icon}</span>
      </div>

      <div className="ff-display" style={{ fontSize: 26, fontWeight: 700, color: COLORS.ink, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 6 }}>
        {value}
      </div>

      <div style={{ fontSize: 12, color, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
        {sub} <ChevronRight size={11} />
      </div>
    </button>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({ text }) {
  return (
    <div style={{ padding: "36px 16px", textAlign: "center" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
        <TrendingUp size={16} color={COLORS.inkMuted} />
      </div>
      <p style={{ fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.6, margin: 0, maxWidth: 240, marginLeft: "auto", marginRight: "auto" }}>
        {text}
      </p>
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────
export function Field({ label, children, style }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 10, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.07em", flex: 1, ...style }}>
      {label}
      {children}
    </label>
  );
}
