import { X, CalendarDays, CalendarRange, CalendarClock, Trash2 } from "lucide-react";
import { COLORS } from "../../constants/colors.js";

const EDIT_OPTIONS = [
  { scope: "only_this",      Icon: CalendarDays,   label: "Só este mês",       desc: "Altera apenas a ocorrência deste mês. Os demais ficam iguais." },
  { scope: "this_and_future",Icon: CalendarRange,  label: "Este e os próximos", desc: "Altera a partir deste mês. Os meses anteriores ficam iguais." },
  { scope: "all",            Icon: CalendarClock,  label: "Todo o período",     desc: "Altera o registro completo desde o início." },
];

const DELETE_OPTIONS = [
  { scope: "only_this",      Icon: CalendarDays,   label: "Só este mês",        desc: "Remove apenas a ocorrência deste mês.", danger: false },
  { scope: "this_and_future",Icon: CalendarRange,  label: "Este e os próximos",  desc: "Remove a partir deste mês. Meses anteriores são mantidos.", danger: false },
  { scope: "all",            Icon: Trash2,         label: "Excluir tudo",        desc: "Remove o registro completo e todas as ocorrências.", danger: true },
];

export function RecurrenceScopeModal({ mode, onSelect, onClose }) {
  const isDelete = mode === "delete";
  const options  = isDelete ? DELETE_OPTIONS : EDIT_OPTIONS;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(7,9,12,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 70, backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="scale-in" style={{ background: COLORS.surface, borderRadius: 20, padding: "26px 26px 28px", width: "100%", maxWidth: 400, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 32px 80px rgba(0,0,0,0.75)" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: COLORS.ink }}>
            {isDelete ? "Excluir item recorrente" : "Alterar item recorrente"}
          </h2>
          <button onClick={onClose} style={{ background: COLORS.surfaceAlt, border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 7, borderRadius: 8 }}>
            <X size={14} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: COLORS.inkMuted, margin: "0 0 20px" }}>
          Este item se repete todo mês. O que deseja {isDelete ? "excluir" : "alterar"}?
        </p>

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map(({ scope, Icon, label, desc, danger }) => (
            <button
              key={scope}
              onClick={() => onSelect(scope)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 14,
                background: danger ? `${COLORS.danger}0D` : COLORS.surfaceAlt,
                border: `1px solid ${danger ? `${COLORS.danger}30` : COLORS.line}`,
                borderRadius: 12, padding: "14px 16px",
                textAlign: "left", cursor: "pointer", width: "100%",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = danger ? `${COLORS.danger}20` : COLORS.surfaceAlt2;
                e.currentTarget.style.borderColor = danger ? `${COLORS.danger}60` : COLORS.river + "50";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = danger ? `${COLORS.danger}0D` : COLORS.surfaceAlt;
                e.currentTarget.style.borderColor = danger ? `${COLORS.danger}30` : COLORS.line;
              }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: danger ? `${COLORS.danger}15` : `${COLORS.river}12` }}>
                <Icon size={16} color={danger ? COLORS.danger : COLORS.river} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: danger ? COLORS.danger : COLORS.ink, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.4 }}>{desc}</div>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{ marginTop: 16, width: "100%", background: "none", border: `1px solid ${COLORS.line}`, color: COLORS.inkMuted, borderRadius: 10, padding: "10px 0", fontSize: 13, cursor: "pointer" }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
