import { useState } from "react";
import { LayoutGrid, ChevronRight, Menu, Search, Calendar, CreditCard, Landmark, Pencil,
         FileSpreadsheet, Download, Upload, Trash2, TrendingUp, TrendingDown, X, Home } from "lucide-react";
import { COLORS } from "../../constants/colors.js";

// ── Sidebar ──────────────────────────────────────────────────────────────────
export function Sidebar({
  open, setOpen, view, setView,
  expandedGroups, setExpandedGroups,
  cards, banks,
  layoutEditMode, setLayoutEditMode,
  onDownloadTemplate, onExportData, onTriggerImport, onTriggerOFXImport, onTriggerCardPDFImport,
  onDeleteMonthIncomes, onDeleteMonthExpenses,
  onGoHome,
}) {
  const [menuSearch, setMenuSearch] = useState("");

  function toggleGroup(key) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (!open) return null;

  const q          = menuSearch.trim().toLowerCase();
  const norm       = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const matches    = (t) => !q || norm(t).includes(norm(q));

  const visaoItems = [
    { key: "agora",    label: "Agora",           icon: <LayoutGrid size={14} /> },
    { key: "projecao", label: "Próximos meses",  icon: <Calendar   size={14} /> },
  ].filter((i) => matches(i.label));

  const showDeleteIncomes  = matches("Excluir receitas");
  const showDeleteExpenses = matches("Excluir despesas");
  const showVisaoGeral     = matches("Visão Geral") || visaoItems.length > 0 || showDeleteIncomes || showDeleteExpenses;

  const matchingCards = cards.filter((c) => matches(c.name));
  const showCartoes   = matches("Cartões") || matchingCards.length > 0;

  const matchingBanks = banks.filter((b) => matches(b.name));
  const showBancos    = matches("Bancos") || matchingBanks.length > 0;

  const showCategorias  = matches("Categorias") || matches("Gerenciar categorias");
  const showRelatorios  = matches("Relatórios") || matches("Receitas") || matches("Despesas") || matches("relatório");
  const showImportExport= matches("Importar") || matches("Exportar") || matches("Excel") || matches("OFX") || matches("PDF");

  const isRelatorios = view === "relatorios-receitas" || view === "relatorios-despesas";

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />

      <div style={{
        position: "relative", zIndex: 10,
        width: 248, flexShrink: 0,
        background: "#050709",   // ligeiramente mais escuro que o bg
        borderRight: `1px solid ${COLORS.line}`,
        minHeight: "100vh",
        display: "flex", flexDirection: "column",
      }}>

        {/* ── Header — Atlas Gestão brand ── */}
        <div style={{ padding: "18px 16px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${COLORS.line}` }}>
          <button
            onClick={() => setView("agora")}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: 0 }}
          >
            {/* Brand mark — barras ascendentes + círculo dourado */}
            <svg width="30" height="30" viewBox="0 0 200 200" fill="none" aria-hidden="true">
              <rect x="12"  y="120" width="42" height="68"  rx="9" fill="white" opacity="0.85"/>
              <rect x="79"  y="90"  width="42" height="98"  rx="9" fill="white" opacity="0.85"/>
              <rect x="146" y="52"  width="42" height="136" rx="9" fill="white" opacity="0.85"/>
              <circle cx="167" cy="32" r="20" fill="#E0BF4C"/>
            </svg>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
              <div className="ff-brand" style={{ fontSize: 14, lineHeight: 1.1, letterSpacing: "-0.01em" }}>
                <span style={{ fontWeight: 700, color: COLORS.ink }}>Atlas </span>
                <span style={{ fontWeight: 400, color: COLORS.river }}>Gestão</span>
              </div>
              <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: COLORS.inkMuted }}>
                Financeiro
              </span>
            </div>
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", display: "flex", padding: 4, borderRadius: 6 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Search ── */}
        <div style={{ padding: "12px 12px 8px" }}>
          <div style={{ position: "relative" }}>
            <Search size={12} color={COLORS.inkMuted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Buscar..."
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              style={{
                width: "100%", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`,
                borderRadius: 8, padding: "7px 10px 7px 28px", fontSize: 12, color: COLORS.ink, outline: "none",
              }}
            />
          </div>
        </div>

        {/* ── Personalizar ── */}
        <div style={{ padding: "0 12px 10px" }}>
          <button
            onClick={() => { setLayoutEditMode((v) => !v); if (view !== "agora") setView("agora"); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: layoutEditMode ? `${COLORS.amber}15` : "transparent",
              border: `1px solid ${layoutEditMode ? `${COLORS.amber}50` : COLORS.line}`,
              color: layoutEditMode ? COLORS.amber : COLORS.inkMuted,
              borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            <LayoutGrid size={12} />
            {layoutEditMode ? "Concluir personalização" : "Personalizar tela"}
          </button>
        </div>

        {/* ── Nav ── */}
        <div className="scrollbar-thin" style={{ flex: 1, overflowY: "auto", padding: "4px 0 20px" }}>
          {!showVisaoGeral && !showCartoes && !showBancos && !showCategorias && !showRelatorios && !showImportExport && (
            <div style={{ padding: "16px", fontSize: 12, color: COLORS.inkMuted, textAlign: "center" }}>
              Nada encontrado.
            </div>
          )}

          {/* Visão Geral */}
          {showVisaoGeral && (
            <Section label="Visão Geral">
              {visaoItems.map((i) => (
                <NavItem key={i.key} icon={i.icon} label={i.label} active={view === i.key} onClick={() => setView(i.key)} />
              ))}
              {(!q || showDeleteIncomes) && (
                <NavItem icon={<Trash2 size={14} />} label="Excluir receitas do mês" onClick={onDeleteMonthIncomes} danger />
              )}
              {(!q || showDeleteExpenses) && (
                <NavItem icon={<Trash2 size={14} />} label="Excluir despesas do mês" onClick={onDeleteMonthExpenses} danger />
              )}
            </Section>
          )}

          {/* Cartões */}
          {showCartoes && (
            <SidebarGroup label="Cartões" icon={<CreditCard size={14} />}
              expanded={q ? true : expandedGroups.cartoes} onToggle={() => toggleGroup("cartoes")}
            >
              {matchingCards.map((c) => (
                <NavItem key={c.id} icon={<span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />}
                  label={c.name} active={false} onClick={() => setView("cartoes")} sub />
              ))}
              {!q && cards.length === 0 && (
                <div style={{ padding: "6px 14px 6px 38px", fontSize: 11, color: COLORS.inkMuted }}>Nenhum cartão ainda</div>
              )}
            </SidebarGroup>
          )}

          {/* Bancos */}
          {showBancos && (
            <SidebarGroup label="Bancos" icon={<Landmark size={14} />}
              expanded={q ? true : expandedGroups.bancos} onToggle={() => toggleGroup("bancos")}
              onHeaderClick={() => setView("bancos")} active={view === "bancos"}
            >
              {matchingBanks.map((b) => (
                <NavItem key={b.id} icon={<span style={{ width: 8, height: 8, borderRadius: "50%", background: b.color, flexShrink: 0 }} />}
                  label={b.name} active={false} onClick={() => setView("bancos")} sub />
              ))}
              {!q && banks.length === 0 && (
                <div style={{ padding: "6px 14px 6px 38px", fontSize: 11, color: COLORS.inkMuted }}>Nenhum banco ainda</div>
              )}
            </SidebarGroup>
          )}

          {/* Categorias */}
          {showCategorias && (
            <Section label="Configurações">
              <NavItem icon={<Pencil size={14} />} label="Categorias" active={view === "categorias"} onClick={() => setView("categorias")} />
            </Section>
          )}

          {/* Relatórios */}
          {showRelatorios && (
            <Section label="Relatórios">
              <NavItem icon={<TrendingUp size={14} />} label="Receitas" active={view === "relatorios-receitas"} onClick={() => setView("relatorios-receitas")} />
              <NavItem icon={<TrendingDown size={14} />} label="Despesas" active={view === "relatorios-despesas"} onClick={() => setView("relatorios-despesas")} />
            </Section>
          )}

          {/* Importar / Exportar */}
          {showImportExport && (
            <Section label="Dados">
              <NavItem icon={<Download size={14} />}      label="Baixar modelo (Excel)"       onClick={onDownloadTemplate} />
              <NavItem icon={<FileSpreadsheet size={14} />} label="Exportar meus dados"        onClick={onExportData} />
              <NavItem icon={<Upload size={14} />}        label="Importar planilha (Excel)"    onClick={onTriggerImport} />
              <NavItem icon={<Upload size={14} />}        label="Importar extrato (OFX)"       onClick={onTriggerOFXImport} />
              <NavItem icon={<Upload size={14} />}        label="Importar fatura cartão (PDF)" onClick={onTriggerCardPDFImport} />
            </Section>
          )}
        </div>

        {/* ── Home link ── */}
        {onGoHome && (
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${COLORS.line}` }}>
            <button onClick={onGoHome} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", fontSize: 12, fontWeight: 500, padding: "7px 10px", borderRadius: 8 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surfaceAlt; e.currentTarget.style.color = COLORS.ink; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = COLORS.inkMuted; }}>
              <Home size={13} /> Início dos módulos
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ padding: "14px 16px 5px", fontSize: 10, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </div>
      <div style={{ padding: "0 8px" }}>
        {children}
      </div>
    </div>
  );
}

// ── Nav item — pill active state ──────────────────────────────────────────────
function NavItem({ icon, label, active, onClick, danger, sub }) {
  const color = danger ? COLORS.danger : (active ? COLORS.river : COLORS.inkMuted);
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 9,
        padding: sub ? "7px 10px 7px 14px" : "7px 10px",
        background: active ? `${COLORS.river}14` : "none",
        border: "none", borderRadius: 8, cursor: "pointer",
        color, fontSize: 13, fontWeight: active ? 600 : 500,
        textAlign: "left", whiteSpace: "nowrap", overflow: "hidden",
        transition: "background 0.1s, color 0.1s",
      }}
      onMouseEnter={(e) => { if (!active && !danger) { e.currentTarget.style.background = `${COLORS.surfaceAlt}`; e.currentTarget.style.color = COLORS.ink; } }}
      onMouseLeave={(e) => { if (!active && !danger) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = color; } }}
    >
      <span style={{ flexShrink: 0, display: "flex", opacity: active ? 1 : 0.7 }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </button>
  );
}

// ── Collapsible group (Cartões / Bancos) ──────────────────────────────────────
export function SidebarGroup({ label, icon, expanded, onToggle, onHeaderClick, active, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ padding: "0 8px" }}>
        <button
          onClick={() => { onToggle(); if (onHeaderClick) onHeaderClick(); }}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 10px", background: active ? `${COLORS.river}14` : "none",
            border: "none", borderRadius: 8, cursor: "pointer",
            color: active ? COLORS.river : COLORS.inkMuted, fontSize: 13, fontWeight: 600,
            transition: "background 0.1s, color 0.1s",
          }}
          onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = COLORS.surfaceAlt; e.currentTarget.style.color = COLORS.ink; } }}
          onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = active ? COLORS.river : COLORS.inkMuted; } }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ flexShrink: 0, display: "flex", opacity: active ? 1 : 0.7 }}>{icon}</span>
            {label}
          </span>
          <ChevronRight size={13} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", opacity: 0.5 }} />
        </button>
      </div>
      {expanded && (
        <div style={{ padding: "0 8px 4px 24px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Mantidos para compatibilidade com imports existentes (CartoesView / BancosView etc.)
export function SidebarItem({ active, onClick, icon, label, danger }) {
  return <NavItem icon={icon} label={label} active={active} onClick={onClick} danger={danger} />;
}

export function SidebarSubItem({ onClick, color, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 9,
        padding: "6px 10px", background: "none", border: "none",
        cursor: "pointer", color: COLORS.inkMuted, fontSize: 12,
        textAlign: "left", borderRadius: 8,
        transition: "background 0.1s, color 0.1s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surfaceAlt; e.currentTarget.style.color = COLORS.ink; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = COLORS.inkMuted; }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </button>
  );
}
