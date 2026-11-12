import { useState } from "react";
import { Plus } from "lucide-react";
import { COLORS } from "../../constants/colors.js";
import { formatBRL } from "../../utils/format.js";
import { getInstallmentStatus } from "../../utils/installments.js";
import { inputStyle, btnStyle } from "../../styles/shared.js";
import { Modal } from "./Modal.jsx";
import { Field } from "./Primitives.jsx";
import { MoneyInput } from "./MoneyInput.jsx";

export function PaymentInfoModal({
  bankPicker, banks, bankBalances, expenses, cardItems, incomes,
  bankPickerDate, setBankPickerDate, paymentForm, setPaymentForm,
  onConfirm, onClose, onGoToCreateBank,
}) {
  const [payMode, setPayMode] = useState("total"); // "total" | "parcial"

  const pickerType = bankPicker.type;
  const isIncome   = pickerType === "income";
  const isAutoCard = pickerType === "autoCardExpense";

  let installmentValue = 0;
  let remainingDue = 0;
  if (pickerType === "expense") {
    const ex = expenses.find((e) => e.id === bankPicker.id);
    if (ex) {
      const status = getInstallmentStatus(ex, bankPicker.installment);
      installmentValue = status.installmentValue;
      remainingDue     = status.remaining;
    }
  } else if (pickerType === "cardItem") {
    const ci = cardItems.find((it) => it.id === bankPicker.id);
    if (ci) {
      const status = getInstallmentStatus(ci, bankPicker.installment);
      installmentValue = status.installmentValue;
      remainingDue     = status.remaining;
    }
  } else if (pickerType === "income") {
    const inc = incomes.find((i) => i.id === bankPicker.id);
    if (inc) {
      const status = getInstallmentStatus(inc, bankPicker.installment || 1);
      installmentValue = status.installmentValue;
      remainingDue     = status.remaining;
    }
  } else if (isAutoCard) {
    // invoiceTotal = valor cheio da fatura; remaining = restante a pagar (já subtraídos parciais anteriores)
    installmentValue = bankPicker.invoiceTotal || 0;
    remainingDue     = bankPicker.remaining ?? bankPicker.invoiceTotal ?? 0;
  }

  const descontoVal = parseFloat(paymentForm.desconto) || 0;
  const jurosVal    = parseFloat(paymentForm.juros)    || 0;
  const multaVal    = parseFloat(paymentForm.multa)    || 0;
  const amountPaid  = parseFloat(paymentForm.amountPaid) || 0;

  // Para fatura de cartão: quanto já foi pago antes desta sessão
  const invoicePaidSoFar = isAutoCard
    ? Math.max(0, (bankPicker.invoiceTotal || 0) - (bankPicker.remaining || 0))
    : 0;

  // Valor com desconto aplicado
  const valorEfetivo = Math.max(0, remainingDue - descontoVal);
  // O que ainda vai ficar em aberto após este pagamento parcial
  const ficaraEmAberto = payMode === "parcial" ? Math.max(0, valorEfetivo - amountPaid) : 0;
  // Total em dinheiro que sai do banco
  const totalConfirmado = amountPaid + jurosVal + multaVal;

  function switchMode(mode) {
    setPayMode(mode);
    if (mode === "total") {
      // Em modo total, redefine o valor pago para o saldo restante (após desconto)
      const efetivo = Math.max(0, remainingDue - descontoVal);
      setPaymentForm((f) => ({ ...f, amountPaid: efetivo > 0 ? String(efetivo.toFixed(2)) : "0" }));
    } else {
      // Em modo parcial, limpa o campo para o usuário digitar
      setPaymentForm((f) => ({ ...f, amountPaid: "" }));
    }
  }

  // Quando desconto muda: em modo total, atualiza valor pago automaticamente
  function handleDescontoChange(e) {
    const novoDesconto = parseFloat(e.target.value) || 0;
    setPaymentForm((f) => {
      const next = { ...f, desconto: e.target.value };
      if (payMode === "total") {
        const efetivo = Math.max(0, remainingDue - novoDesconto);
        next.amountPaid = efetivo > 0 ? String(efetivo.toFixed(2)) : "0";
      }
      return next;
    });
  }

  const modeTabStyle = (active) => ({
    flex: 1, padding: "9px 12px", border: `1px solid ${active ? COLORS.riverDeep : COLORS.line}`,
    borderRadius: 8, background: active ? `${COLORS.riverDeep}18` : COLORS.surfaceAlt,
    color: active ? COLORS.riverDeep : COLORS.inkMuted,
    fontWeight: active ? 700 : 400, fontSize: 13, cursor: "pointer",
    transition: "all .15s",
  });

  return (
    <Modal
      onClose={onClose}
      title={isIncome ? "Informações do recebimento" : "Informações do pagamento"}
      accent={COLORS.riverDeep}
    >
      {banks.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, color: COLORS.inkMuted, margin: 0 }}>
            Você ainda não tem nenhum banco cadastrado. Cadastre um banco primeiro pra poder confirmar recebimentos e pagamentos.
          </p>
          <button
            type="button"
            onClick={onGoToCreateBank}
            style={{ ...btnStyle(COLORS.riverDeep, COLORS.bg), justifyContent: "center" }}
          >
            <Plus size={16} /> Cadastrar banco
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Toggle modo total / parcial */}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={modeTabStyle(payMode === "total")} onClick={() => switchMode("total")}>
              {isIncome ? "💰 Receber tudo" : "💰 Pagar tudo"}
            </button>
            <button type="button" style={modeTabStyle(payMode === "parcial")} onClick={() => switchMode("parcial")}>
              {isIncome ? "📋 Receber parte" : "📋 Pagar parte"}
            </button>
          </div>

          {payMode === "parcial" && (
            <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
              {isIncome
                ? "Informe quanto vai receber agora. O restante fica em aberto para o próximo recebimento."
                : "Informe quanto vai pagar agora. O restante fica em aberto para o próximo pagamento."}
            </p>
          )}

          {/* Box "Já pago" — aparece quando há pagamentos parciais anteriores nesta fatura */}
          {isAutoCard && invoicePaidSoFar > 0.005 && (
            <div style={{
              background: `${COLORS.river}10`, border: `1px solid ${COLORS.river}40`,
              borderRadius: 8, padding: "10px 12px", fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.7,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span>Já pago desta fatura:</span>
                <span className="ff-mono" style={{ fontWeight: 700, color: COLORS.river }}>{formatBRL(invoicePaidSoFar)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span>Restante a pagar:</span>
                <span className="ff-mono" style={{ fontWeight: 700, color: COLORS.ink }}>{formatBRL(remainingDue)}</span>
              </div>
            </div>
          )}

          {/* Valor da parcela + Data */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label={isIncome ? "Valor a receber" : isAutoCard ? "Total da fatura" : "Valor da parcela"}>
              <input
                type="text" value={formatBRL(installmentValue)} disabled
                style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }}
              />
            </Field>
            {isAutoCard && remainingDue < installmentValue && (
              <Field label="Restante a pagar">
                <input
                  type="text" value={formatBRL(remainingDue)} disabled
                  style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed", borderColor: COLORS.amber }}
                />
              </Field>
            )}
            <Field label={isIncome ? "Data em que recebeu" : "Data do pagamento"}>
              <input
                type="date" value={bankPickerDate}
                onChange={(e) => setBankPickerDate(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          {/* Valor a pagar agora (modo parcial) */}
          {payMode === "parcial" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
              <Field label={isIncome ? "Valor que vai receber agora" : "Valor que vai pagar agora"}>
                <MoneyInput
                  value={paymentForm.amountPaid}
                  onChange={(v) => setPaymentForm((f) => ({ ...f, amountPaid: v }))}
                  style={{ ...inputStyle, borderColor: amountPaid > 0 && amountPaid <= valorEfetivo ? COLORS.river : COLORS.line }}
                  autoFocus
                />
              </Field>
              {amountPaid > 0 && ficaraEmAberto > 0.005 && (
                <div style={{
                  flex: 1, minWidth: 160, background: `${COLORS.amber}12`,
                  border: `1px solid ${COLORS.amber}50`, borderRadius: 8, padding: "10px 12px",
                  fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.7,
                }}>
                  <div>
                    {isIncome ? "Total a receber:" : "Total da parcela:"}
                    {" "}<span style={{ color: COLORS.ink, fontWeight: 600 }}>{formatBRL(valorEfetivo)}</span>
                  </div>
                  <div>
                    {isIncome ? "Recebe agora:" : "Paga agora:"}
                    {" "}<span style={{ color: COLORS.river, fontWeight: 600 }}>{formatBRL(amountPaid)}</span>
                  </div>
                  <div style={{ borderTop: `1px solid ${COLORS.line}`, marginTop: 4, paddingTop: 4 }}>
                    Ficará em aberto:{" "}
                    <span style={{ color: COLORS.amber, fontWeight: 700 }}>{formatBRL(ficaraEmAberto)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Encargos e desconto */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Juros">
              <MoneyInput
                value={paymentForm.juros}
                onChange={(v) => setPaymentForm((f) => ({ ...f, juros: v }))}
                style={inputStyle}
              />
            </Field>
            <Field label="Multa">
              <MoneyInput
                value={paymentForm.multa}
                onChange={(v) => setPaymentForm((f) => ({ ...f, multa: v }))}
                style={inputStyle}
              />
            </Field>
            <Field label="Desconto">
              <MoneyInput
                value={paymentForm.desconto}
                onChange={(v) => {
                  const novoDesconto = parseFloat(v) || 0;
                  setPaymentForm((f) => {
                    const next = { ...f, desconto: v };
                    if (payMode === "total") {
                      const efetivo = Math.max(0, remainingDue - novoDesconto);
                      next.amountPaid = efetivo > 0 ? String(efetivo.toFixed(2)) : "0";
                    }
                    return next;
                  });
                }}
                style={{ ...inputStyle, borderColor: descontoVal > 0 ? COLORS.river : COLORS.line }}
              />
            </Field>
          </div>

          {/* Resumo de desconto (quando há desconto) */}
          {descontoVal > 0 && (
            <div style={{
              background: `${COLORS.river}12`, border: `1px solid ${COLORS.river}40`,
              borderRadius: 8, padding: "8px 12px", fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.7,
            }}>
              <div>
                Valor original: <span style={{ color: COLORS.ink }}>{formatBRL(remainingDue)}</span>
              </div>
              <div>
                Desconto: <span style={{ color: COLORS.river, fontWeight: 600 }}>− {formatBRL(descontoVal)}</span>
              </div>
              <div style={{ borderTop: `1px solid ${COLORS.line}`, marginTop: 4, paddingTop: 4 }}>
                {isIncome ? "Valor a receber" : "Valor a pagar"} após desconto:{" "}
                <span style={{ color: COLORS.ink, fontWeight: 700 }}>{formatBRL(valorEfetivo)}</span>
              </div>
            </div>
          )}

          {/* Total confirmado */}
          <div style={{
            display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 8,
            padding: "10px 0 4px", borderTop: `1px solid ${COLORS.line}`,
          }}>
            <span style={{ fontSize: 13, color: COLORS.inkMuted }}>
              Total {isIncome ? "Recebido" : "Pago"}
            </span>
            <span className="ff-mono" style={{ fontSize: 22, fontWeight: 700, color: COLORS.ink }}>
              {formatBRL(payMode === "total" ? (valorEfetivo + jurosVal + multaVal) : totalConfirmado)}
            </span>
          </div>

          {/* Seleção de banco */}
          <Field label={isIncome ? "De qual banco recebeu?" : "De qual banco pagou?"}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {banks.map((bank) => (
                <button
                  type="button" key={bank.id}
                  onClick={() => onConfirm(bank.id)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.line}`,
                    background: COLORS.surfaceAlt, cursor: "pointer", textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = bank.color)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.line)}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: bank.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, color: COLORS.ink, fontSize: 14 }}>{bank.name}</span>
                  </span>
                  <span className="ff-mono" style={{ fontSize: 13, color: COLORS.inkMuted }}>
                    {formatBRL(bankBalances[bank.id] || 0)}
                  </span>
                </button>
              ))}
            </div>
          </Field>
        </div>
      )}
    </Modal>
  );
}
