import { useState, useEffect, useRef } from "react";

// Converte valor numérico/string para centavos inteiros
function toCents(v) {
  if (v === "" || v == null) return 0;
  const n = parseFloat(String(v).replace(",", ".")) || 0;
  return Math.round(Math.abs(n) * 100);
}

// Formata centavos para exibição: 150050 → "1.500,50"
function fmtCents(c) {
  if (!c) return "";
  const s = String(c).padStart(3, "0");
  const int = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${int},${s.slice(-2)}`;
}

/**
 * Input de valor monetário no padrão brasileiro.
 * Modo calculadora: dígitos preenchem da direita (como caixa de banco).
 * Ex: digitar "1", "5", "0", "0", "0", "0", "0" → R$ 15.000,00
 *
 * Props:
 *   value    – string ou número (valor atual, ex: "15000" ou 15000.50)
 *   onChange – chamado com string do valor numérico ("1500.50") ou "" se vazio
 *   style    – objeto de estilos CSS (aplicado ao <input>)
 *   Demais props são repassadas ao <input> (placeholder, onKeyDown, autoFocus…)
 */
export function MoneyInput({ value, onChange, style, placeholder = "0,00", ...rest }) {
  const [cents, setCents] = useState(() => toCents(value));
  const extRef = useRef(value);

  // Sincroniza quando o valor muda externamente (reset de form, troca de mês, etc.)
  useEffect(() => {
    if (value === extRef.current) return;
    extRef.current = value;
    setCents(toCents(value));
  }, [value]);

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 13);
    const c = digits ? parseInt(digits, 10) : 0;
    setCents(c);
    const strVal = c > 0 ? String(c / 100) : "";
    extRef.current = strVal;
    onChange?.(strVal);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={fmtCents(cents)}
      onChange={handleChange}
      placeholder={placeholder}
      style={style}
      {...rest}
    />
  );
}
