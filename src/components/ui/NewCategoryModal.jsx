import { COLORS } from "../../constants/colors.js";
import { CATEGORY_COLOR_OPTIONS } from "../../constants/options.js";
import { inputStyle, btnStyle } from "../../styles/shared.js";
import { Modal } from "./Modal.jsx";
import { Field } from "./Primitives.jsx";

export function NewCategoryModal({ title, accent, form, setForm, existingGroups, onClose, onSubmit, zIndex, submitLabel = "Criar categoria" }) {
  const isExistingGroup = existingGroups.includes(form.group.trim());
  return (
    <Modal onClose={onClose} title={title} accent={accent} zIndex={zIndex}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nome da categoria">
          <input
            autoFocus placeholder="Ex: Pet shop, Assinatura de revista..."
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={inputStyle}
          />
        </Field>
        <Field label="Grupo">
          <input
            placeholder="Ex: Pets, Lazer... (ou crie um grupo novo)"
            value={form.group}
            onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") onSubmit(e); }}
            style={inputStyle}
          />
          {existingGroups.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {existingGroups.map((g) => (
                <button
                  type="button" key={g}
                  onClick={() => setForm((f) => ({ ...f, group: g }))}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 14, cursor: "pointer",
                    border: `1px solid ${form.group.trim() === g ? accent : COLORS.line}`,
                    background: form.group.trim() === g ? `${accent}22` : "transparent",
                    color: form.group.trim() === g ? accent : COLORS.inkMuted,
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </Field>
        {form.group.trim() && !isExistingGroup && (
          <Field label="Cor do grupo novo">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CATEGORY_COLOR_OPTIONS.map((color) => (
                <button
                  type="button" key={color}
                  onClick={() => setForm((f) => ({ ...f, color }))}
                  aria-label={`Cor ${color}`}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", background: color, cursor: "pointer",
                    border: form.color === color ? `2px solid ${COLORS.ink}` : "2px solid transparent",
                    boxShadow: form.color === color ? `0 0 0 2px ${COLORS.surface}` : "none",
                  }}
                />
              ))}
            </div>
          </Field>
        )}
        {form.group.trim() && isExistingGroup && (
          <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
            Essa categoria vai herdar a cor do grupo "{form.group.trim()}", que já existe.
          </p>
        )}
        <button type="button" onClick={onSubmit} style={{ ...btnStyle(accent, COLORS.bg), justifyContent: "center", marginTop: 6 }}>
          {submitLabel}
        </button>
      </div>
    </Modal>
  );
}
