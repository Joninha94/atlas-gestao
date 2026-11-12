import { COLORS } from "../constants/colors.js";

export const inputStyle = {
  background: COLORS.surfaceAlt,
  border: `1px solid ${COLORS.line}`,
  borderRadius: 10,
  padding: "10px 14px",
  color: COLORS.ink,
  fontSize: 14,
  outline: "none",
  width: "100%",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

export function btnStyle(bg, fg) {
  return {
    background: bg,
    color: fg,
    border: "none",
    borderRadius: 10,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 7,
    letterSpacing: "0.01em",
  };
}

export const sectionTitle = {
  fontSize: 11,
  fontWeight: 700,
  color: COLORS.inkMuted,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: "0 0 14px",
};
