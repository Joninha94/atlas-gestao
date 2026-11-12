import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { COLORS } from "../../../constants/colors.js";

const C = COLORS;
const PAGE_SIZE = 30;

const inputStyle = {
  background: C.surfaceAlt,
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  color: C.ink,
  padding: "8px 10px",
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
};

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function CnaeReductionLookup() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let active = true;

    fetch(`${import.meta.env.BASE_URL}data/cnaeReductions.json`)
      .then(response => {
        if (!response.ok) throw new Error(`Não foi possível carregar o catálogo CNAE (HTTP ${response.status}).`);
        return response.json();
      })
      .then(result => {
        if (!Array.isArray(result.cnaes) || !Array.isArray(result.beneficios)) {
          throw new Error("O catálogo CNAE recebido tem formato inválido.");
        }
        if (active) setData(result);
      })
      .catch(error => {
        if (active) setLoadError(error instanceof Error ? error.message : "Não foi possível carregar o catálogo CNAE.");
      });

    return () => { active = false; };
  }, []);

  const detailsByCnae = useMemo(() => (data?.beneficios ?? []).reduce((map, item) => {
    const key = item.cnae.replace(/\D/g, "");
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map()), [data]);

  const results = useMemo(() => {
    if (!data) return [];
    const term = normalize(query);
    const digits = term.replace(/\D/g, "");

    return data.cnaes.filter(item => {
      if (filter === "comReducao" && item.temReducao === "Não") return false;
      if (filter === "semReducao" && item.temReducao !== "Não") return false;
      if (filter === "parcial" && item.temReducao !== "Sim, em parte") return false;
      if (!term) return true;

      const detailed = detailsByCnae.get(item.cnae.replace(/\D/g, "")) ?? [];
      const searchable = normalize([
        item.cnae,
        item.descricao,
        item.secao,
        item.temReducao,
        item.reducao,
        item.beneficio,
        item.baseLegal,
        item.condicoes,
        ...detailed.flatMap(detail => [
          detail.reducao,
          detail.beneficio,
          detail.baseLegal,
          detail.condicoes,
        ]),
      ].join(" "));

      return searchable.includes(term) || (digits.length >= 3 && item.cnae.replace(/\D/g, "").includes(digits));
    });
  }, [data, detailsByCnae, filter, query]);

  const visibleResults = results.slice(0, visibleCount);

  function updateQuery(value) {
    setQuery(value);
    setVisibleCount(PAGE_SIZE);
  }

  function updateFilter(value) {
    setFilter(value);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
          Consulta de atividades e reduções por CNAE
        </div>
        <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.5 }}>
          {data
            ? `Planilha de referência: ${data.cnaes.length.toLocaleString("pt-BR")} CNAEs e ${data.beneficios.length.toLocaleString("pt-BR")} vínculos detalhados. Pesquise pelo código, atividade, benefício ou base legal.`
            : "Base de referência importada da planilha fornecida. Pesquise pelo código, atividade, benefício ou base legal."}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ position: "relative", flex: "1 1 280px" }}>
          <Search size={15} aria-hidden="true" style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.inkMuted,
          }} />
          <input
            type="search"
            value={query}
            onChange={event => updateQuery(event.target.value)}
            placeholder="Ex.: 0111-3/01, cultivo de arroz, saúde, art. 128"
            aria-label="Buscar CNAE, atividade, benefício ou base legal"
            disabled={!data}
            style={{ ...inputStyle, width: "100%", paddingLeft: 32 }}
          />
        </label>
        <select
          value={filter}
          onChange={event => updateFilter(event.target.value)}
          aria-label="Filtrar CNAEs por tratamento"
          disabled={!data}
          style={{ ...inputStyle, minWidth: 180 }}
        >
          <option value="todos">Todos os CNAEs</option>
          <option value="comReducao">Com indicação de redução</option>
          <option value="parcial">Redução em parte</option>
          <option value="semReducao">Sem redução indicada</option>
        </select>
      </div>

      <div aria-live="polite" style={{ fontSize: 11, color: C.inkMuted, marginBottom: 10 }}>
        {loadError
          ? loadError
          : !data
            ? "Carregando catálogo de atividades e reduções…"
            : `${results.length.toLocaleString("pt-BR")} resultado${results.length === 1 ? "" : "s"}${!query && filter === "todos" ? " — digite para consultar ou escolha um filtro" : ""}`}
      </div>

      {(query || filter !== "todos") && (
        <div style={{ display: "grid", gap: 8 }}>
          {visibleResults.map(item => {
            const details = detailsByCnae.get(item.cnae.replace(/\D/g, "")) ?? [];
            const hasReduction = item.temReducao !== "Não";
            return (
              <article
                key={item.cnae}
                style={{
                  background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 9, padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>
                      <span style={{ color: C.copper, marginRight: 8 }}>{item.cnae}</span>
                      {item.descricao}
                    </div>
                    <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 4 }}>{item.secao}</div>
                  </div>
                  <div style={{
                    color: hasReduction ? C.leaf : C.inkMuted,
                    border: `1px solid ${hasReduction ? `${C.leaf}55` : C.line}`,
                    background: hasReduction ? `${C.leaf}12` : "transparent",
                    borderRadius: 99, padding: "3px 8px", fontSize: 10, fontWeight: 700, alignSelf: "flex-start",
                  }}>
                    {item.temReducao} · {item.reducao}
                  </div>
                </div>

                {item.beneficio && (
                  <div style={{ fontSize: 11, color: C.ink, marginTop: 8, lineHeight: 1.5 }}>
                    <strong>Indicação:</strong> {item.beneficio}
                  </div>
                )}
                {item.baseLegal && (
                  <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 4 }}>
                    <strong>Base legal indicada:</strong> {item.baseLegal}
                  </div>
                )}
                {item.condicoes && (
                  <div style={{ fontSize: 10, color: C.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
                    <strong>Condições:</strong> {item.condicoes}
                  </div>
                )}

                {details.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 9, paddingTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, marginBottom: 5 }}>
                      Benefícios detalhados relacionados
                    </div>
                    <div style={{ display: "grid", gap: 7 }}>
                      {details.map((detail, index) => (
                        <div key={`${detail.beneficio}-${detail.reducao}-${index}`} style={{ fontSize: 10, lineHeight: 1.5 }}>
                          <div style={{ color: C.ink }}>
                            <strong>{detail.reducao}</strong> — {detail.beneficio}
                            {detail.baseLegal && <span style={{ color: C.inkMuted }}> ({detail.baseLegal})</span>}
                          </div>
                          {detail.condicoes && <div style={{ color: C.inkMuted }}>{detail.condicoes}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {(query || filter !== "todos") && results.length === 0 && (
        <div style={{ fontSize: 12, color: C.inkMuted, padding: "14px 0" }}>
          Nenhum CNAE encontrado para esta busca.
        </div>
      )}

      {visibleCount < results.length && (
        <button
          type="button"
          onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
          style={{
            ...inputStyle, display: "block", margin: "12px auto 0", cursor: "pointer", color: C.ink,
          }}
        >
          Mostrar mais ({(results.length - visibleCount).toLocaleString("pt-BR")} restantes)
        </button>
      )}
    </section>
  );
}
