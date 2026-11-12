import { useMemo } from "react";
import { COLORS } from "../../../constants/colors.js";
import { formatBRL } from "../../../utils/format.js";
import { MoneyInput } from "../../../components/ui/MoneyInput.jsx";
import { calcInssPatronal } from "../utils/calcInss.js";
import { calcRetencoes, TIPOS_RETENCAO } from "../utils/calcRetencoes.js";
import { INSS_CPP, INSS_RAT, SISTEMA_S_PADRAO, FGTS_PERCENTUAL } from "../constants/parametros2026.js";

const C = COLORS;

const inp = {
  background: C.surfaceAlt, border: `1px solid ${C.line}`,
  borderRadius: 8, color: C.ink, padding: "8px 12px",
  fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none",
};

function Lbl({ children }) {
  return <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>{children}</div>;
}

function ResultRow({ label, pct, value, bold, muted }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "6px 0", borderBottom: `1px solid ${C.line}`, fontSize: bold ? 14 : 13,
    }}>
      <div>
        <span style={{ color: bold ? C.ink : C.inkMuted }}>{label}</span>
        {pct != null && <span style={{ fontSize: 11, color: C.inkMuted, marginLeft: 6 }}>{pct}%</span>}
      </div>
      <span style={{ fontWeight: bold ? 700 : 400, color: bold ? C.river : muted ? C.inkMuted : C.ink }}>
        {formatBRL(value)}
      </span>
    </div>
  );
}

function Toggle({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map(o => (
        <button key={String(o.val)} onClick={() => onChange(o.val)} style={{
          padding: "5px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
          fontWeight: value === o.val ? 700 : 400,
          background: value === o.val ? `${C.copper}20` : C.surfaceAlt,
          border: `1px solid ${value === o.val ? C.copper : C.line}`,
          color: value === o.val ? C.copper : C.inkMuted,
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── INSS Patronal ─────────────────────────────────────────────────────────────
function InssSection({ empresa, config, onChange }) {
  const folhaStr = config.folhaMensal ?? String((parseFloat(empresa?.folhaAnual) || 0) / 12);
  const grauRisco = config.grauRisco || "medio";
  const fapStr = config.fap ?? "1.00";
  const sStr = config.pctSistemaS ?? String(SISTEMA_S_PADRAO);
  const fgts = Boolean(config.incluirFGTS);

  const folha = parseFloat(folhaStr) || 0;
  const fap   = parseFloat(fapStr)   || 1.0;
  const pctS  = parseFloat(sStr)     || SISTEMA_S_PADRAO;

  const res = useMemo(() => {
    if (folha <= 0) return null;
    return calcInssPatronal({ folhaMensal: folha, grauRisco, fap, pctSistemaS: pctS, incluirFGTS: fgts });
  }, [folha, grauRisco, fap, pctS, fgts]);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>INSS Patronal</div>
        {empresa?.folhaAnual && (
          <div style={{ fontSize: 11, color: C.inkMuted }}>Folha pré-preenchida com anual ÷ 12</div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <Lbl>Folha de salários mensal (salários + pró-labore)</Lbl>
          <MoneyInput value={folhaStr} onChange={value => onChange("folhaMensal", value)} style={inp} placeholder="0,00" />
        </div>
        <div>
          <Lbl>Grau de risco da atividade (RAT/SAT)</Lbl>
          <select value={grauRisco} onChange={e => onChange("grauRisco", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
            <option value="leve">Leve — {INSS_RAT.leve}%</option>
            <option value="medio">Médio — {INSS_RAT.medio}%</option>
            <option value="grave">Grave — {INSS_RAT.grave}%</option>
          </select>
        </div>
        <div>
          <Lbl>FAP — Fator Acidentário de Prevenção (0,50 a 2,00)</Lbl>
          <input type="number" value={fapStr} step="0.01" min="0.50" max="2.00"
            onChange={e => onChange("fap", e.target.value)} style={inp} />
        </div>
        <div>
          <Lbl>Sistema S / Terceiros (%)</Lbl>
          <input type="number" value={sStr} step="0.1" min="0" max="10"
            onChange={e => onChange("pctSistemaS", e.target.value)} style={inp} />
          <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
            Padrão: {SISTEMA_S_PADRAO}% (FPAS 833) — varia conforme CNAE
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Lbl>Incluir FGTS na simulação</Lbl>
        <Toggle value={fgts} onChange={value => onChange("incluirFGTS", value)}
          options={[{ val: false, label: "Não" }, { val: true, label: `Sim (${FGTS_PERCENTUAL}%)` }]} />
      </div>

      {res ? (
        <div>
          <div style={{ fontSize: 11, color: C.inkMuted, marginBottom: 10 }}>Resultado mensal</div>
          {res.detalhe.map((d, i) => (
            <ResultRow key={i} label={d.label} pct={d.pct} value={d.valor} />
          ))}
          <div style={{ marginTop: 10, padding: "10px 0", borderTop: `2px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
                Total encargos{fgts ? " (c/ FGTS)" : " (s/ FGTS)"}
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: C.river }}>
                {formatBRL(fgts ? res.totalComFgts : res.totalSemFgts)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.inkMuted }}>
              {(fgts ? res.pctTotalComFgts : res.pctTotalFolha).toFixed(1).replace(".", ",")}% sobre a folha mensal de {formatBRL(folha)}
            </div>
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
              Custo total mensal: {formatBRL(folha + (fgts ? res.totalComFgts : res.totalSemFgts))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.inkMuted, textAlign: "center", padding: "16px 0" }}>
          Informe a folha mensal para calcular.
        </div>
      )}
    </div>
  );
}

// ── Retenções na Fonte ────────────────────────────────────────────────────────
function RetencaoSection({ config, onChange }) {
  const notaStr = config.nota ?? "";
  const tipo = config.tipoRetencao || "servico_profissional";
  const simples = Boolean(config.prestadorSimples);
  const materialStr = config.material ?? "";

  const valorNota = parseFloat(notaStr)     || 0;
  const material  = parseFloat(materialStr) || 0;
  const isCessao  = tipo === "cessao_mao_obra";

  const res = useMemo(() => {
    if (valorNota <= 0) return null;
    return calcRetencoes({ valorNota, tipoRetencao: tipo, prestadorSimples: simples, materialDeducao: material });
  }, [valorNota, tipo, simples, material]);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 16 }}>
        Retenções na Fonte — PJ Tomador → PJ Prestador
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <Lbl>Valor bruto da nota fiscal / fatura</Lbl>
          <MoneyInput value={notaStr} onChange={value => onChange("nota", value)} style={inp} placeholder="0,00" />
        </div>
        <div>
          <Lbl>Tipo de serviço</Lbl>
          <select value={tipo} onChange={e => onChange("tipoRetencao", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
            {Object.entries(TIPOS_RETENCAO).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>{TIPOS_RETENCAO[tipo]?.base}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <div>
          <Lbl>Prestador é optante do Simples Nacional?</Lbl>
          <Toggle value={simples} onChange={value => onChange("prestadorSimples", value)}
            options={[{ val: false, label: "Não" }, { val: true, label: "Sim — CSRF dispensada" }]} />
        </div>
        {isCessao && (
          <div>
            <Lbl>Dedução de material / equipamento (base INSS)</Lbl>
            <MoneyInput value={materialStr} onChange={value => onChange("material", value)}
              style={{ ...inp, width: 160 }} placeholder="0,00" />
          </div>
        )}
      </div>

      {res ? (
        <div>
          <div style={{ fontSize: 11, color: C.inkMuted, marginBottom: 10 }}>Retenções sobre {formatBRL(res.valorNota)}</div>
          {res.detalhe.map((d, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13,
            }}>
              <div>
                <span style={{ color: d.dispensado ? C.inkMuted : C.ink, textDecoration: d.dispensado ? "line-through" : "none" }}>
                  {d.label}
                </span>
                {d.obs && <span style={{ fontSize: 11, color: C.leaf, marginLeft: 8 }}>{d.obs}</span>}
              </div>
              <span style={{ color: d.dispensado ? C.inkMuted : C.danger, textDecoration: d.dispensado ? "line-through" : "none" }}>
                {formatBRL(d.bruto)}
              </span>
            </div>
          ))}
          <div style={{ marginTop: 12, padding: "10px 0", borderTop: `2px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Total retido</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.danger }}>{formatBRL(res.totalRetido)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Valor líquido a receber</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: C.river }}>{formatBRL(res.liquido)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.inkMuted, textAlign: "center", padding: "16px 0" }}>
          Informe o valor da nota fiscal para calcular as retenções.
        </div>
      )}
    </div>
  );
}

export function EncargosView({ empresa = {}, onChange = () => {} }) {
  const config = empresa.encargos || {};
  function update(field, value) {
    onChange({ encargos: { ...config, [field]: value } });
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <InssSection empresa={empresa} config={config} onChange={update} />
      <RetencaoSection config={config} onChange={update} />
    </div>
  );
}
