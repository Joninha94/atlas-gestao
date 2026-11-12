import { Pencil, Trash2 } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { sectionTitle } from "../../styles/shared.js";
import { EmptyState } from "../ui/Primitives.jsx";

export function CategoriasView({
  customIncomeCategories, customExpenseCategories,
  onRemoveIncomeCategory, onRemoveExpenseCategory,
  onEditIncomeCategory, onEditExpenseCategory,
}) {
  function CatRow({ cat, onEdit, onRemove }) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", background: COLORS.surfaceAlt, borderRadius: 10, border: `1px solid ${COLORS.line}`,
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
          <span style={{ fontWeight: 500, color: COLORS.ink }}>{cat.name}</span>
          <span style={{ fontSize: 11, color: COLORS.inkMuted }}>· {cat.group}</span>
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => onEdit(cat)} aria-label="Editar categoria"
            style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 4, borderRadius: 6 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.river)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onRemove(cat.name)} aria-label="Remover categoria"
            style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 4, borderRadius: 6 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.danger)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <p style={{ fontSize: 13, color: COLORS.inkMuted, margin: "0 0 20px" }}>
        Categorias personalizadas que você criou ao cadastrar receitas e despesas. As categorias padrão do Atlas não aparecem aqui — elas já vêm prontas e não podem ser removidas.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* Receitas */}
        <div style={{ background: COLORS.surface, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.line}` }}>
          <h3 style={{ ...sectionTitle, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Categorias de receita</span>
            {customIncomeCategories.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.inkMuted, textTransform: "none", letterSpacing: 0 }}>
                {customIncomeCategories.length} {customIncomeCategories.length === 1 ? "categoria" : "categorias"}
              </span>
            )}
          </h3>
          {customIncomeCategories.length === 0 ? (
            <EmptyState text="Nenhuma categoria personalizada de receita ainda." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {customIncomeCategories.map((cat) => (
                <CatRow key={cat.name} cat={cat} onEdit={onEditIncomeCategory} onRemove={onRemoveIncomeCategory} />
              ))}
            </div>
          )}
        </div>

        {/* Despesas */}
        <div style={{ background: COLORS.surface, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.line}` }}>
          <h3 style={{ ...sectionTitle, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Categorias de despesa</span>
            {customExpenseCategories.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.inkMuted, textTransform: "none", letterSpacing: 0 }}>
                {customExpenseCategories.length} {customExpenseCategories.length === 1 ? "categoria" : "categorias"}
              </span>
            )}
          </h3>
          {customExpenseCategories.length === 0 ? (
            <EmptyState text="Nenhuma categoria personalizada de despesa ainda." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {customExpenseCategories.map((cat) => (
                <CatRow key={cat.name} cat={cat} onEdit={onEditExpenseCategory} onRemove={onRemoveExpenseCategory} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
