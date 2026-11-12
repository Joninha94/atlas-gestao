import { COLORS } from "../../../constants/colors.js";

const C = COLORS;

const TIMELINE = [
  {
    ano: 2026,
    destaque: true,
    titulo: "Fase de Teste",
    cor: C.amber,
    items: [
      "CBS a 0,9% e IBS a 0,1% — compensados integralmente com PIS/COFINS devidos",
      "PIS e COFINS continuam normais; reforma não impacta o caixa do contribuinte",
      "Split payment voluntário para testes de tecnologia",
      "Obrigatoriedade de menção à alíquota de referência nas NFs",
    ],
    ibsCbs: "CBS 0,9% / IBS 0,1%",
    icmsIss: "100% (sem redução)",
  },
  {
    ano: 2027,
    titulo: "CBS Efetiva · IPI extinto",
    cor: "#60A5FA",
    items: [
      "PIS e COFINS extintos — CBS (~8,5%) entra em vigor com aproveitamento de crédito pleno",
      "IPI reduzido a zero para a maioria dos produtos (exceto Zona Franca de Manaus)",
      "IBS começa a ser recolhido em substituição parcial ao ICMS/ISS",
      "Split payment entra em produção para transações acima do limite",
    ],
    ibsCbs: "CBS ~8,5% / IBS ~0%",
    icmsIss: "100% (sem redução)",
  },
  {
    ano: 2029,
    titulo: "Início da Transição ICMS/ISS",
    cor: "#A78BFA",
    items: [
      "Redução de 10% nas alíquotas de ICMS e ISS (primeira parcela)",
      "IBS aumenta proporcionalmente para compensar a arrecadação total",
      "Contribuinte começa a lidar com dois sistemas de tributação simultaneamente",
    ],
    ibsCbs: "CBS + IBS crescente",
    icmsIss: "90% da alíquota atual",
  },
  {
    ano: 2030,
    titulo: "Transição (2ª parcela)",
    cor: "#A78BFA",
    items: [
      "ICMS e ISS reduzidos em mais 10% (total 20% de redução acumulada)",
      "IBS aumenta novamente",
    ],
    ibsCbs: "CBS + IBS crescente",
    icmsIss: "80% da alíquota atual",
  },
  {
    ano: 2031,
    titulo: "Transição (3ª parcela)",
    cor: "#A78BFA",
    items: [
      "ICMS e ISS reduzidos em mais 10% (total 30% de redução acumulada)",
    ],
    ibsCbs: "CBS + IBS crescente",
    icmsIss: "70% da alíquota atual",
  },
  {
    ano: 2032,
    titulo: "Transição (4ª parcela)",
    cor: "#A78BFA",
    items: [
      "ICMS e ISS reduzidos em mais 10% (total 40% de redução acumulada)",
    ],
    ibsCbs: "CBS + IBS crescente",
    icmsIss: "60% da alíquota atual",
  },
  {
    ano: 2033,
    destaque: true,
    titulo: "Sistema Pleno IBS + CBS",
    cor: C.leaf,
    items: [
      "ICMS e ISS extintos — IBS e CBS em plena vigência",
      "Alíquota de referência IBS + CBS estimada em ~27% (definida por resolução do CGSN)",
      "Crédito financeiro pleno: qualquer aquisição tributada gera crédito",
      "Cashback para pessoa física de baixa renda implementado",
      "Sistema tributário definitivo: tributação no destino",
    ],
    ibsCbs: "IBS + CBS ≈ 27%",
    icmsIss: "0% (extintos)",
  },
];

function InfoBox({ color, title, children }) {
  return (
    <div style={{
      background: `${color}12`,
      border: `1px solid ${color}35`,
      borderRadius: 10,
      padding: "12px 16px",
      marginBottom: 12,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 6, letterSpacing: 0.4 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export function ReformaView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 8 }}>
          Reforma Tributária — IBS / CBS (EC 132/2023)
        </div>
        <div style={{ fontSize: 13, color: C.inkMuted, lineHeight: 1.7 }}>
          A Emenda Constitucional 132/2023 criou o Imposto sobre Bens e Serviços (IBS) e a Contribuição sobre Bens e Serviços (CBS),
          substituindo gradualmente PIS, COFINS (extintos em 2027), ICMS e ISS (extintos em 2033). A transição ocorre em 8 anos,
          com redução gradual das alíquotas dos tributos antigos e aumento proporcional dos novos.
        </div>
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────────────── */}
      <div style={{ position: "relative" }}>
        {/* Vertical connector line */}
        <div style={{
          position: "absolute", left: 22, top: 0, bottom: 0, width: 2,
          background: `linear-gradient(to bottom, ${C.amber}, ${C.leaf})`,
          zIndex: 0,
        }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {TIMELINE.map((item) => (
            <div key={item.ano} style={{ display: "flex", gap: 16, position: "relative", zIndex: 1 }}>
              {/* Year dot */}
              <div style={{
                width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                background: item.destaque ? item.cor : C.surface,
                border: `2px solid ${item.cor}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: item.destaque ? "#000" : item.cor,
                boxShadow: item.destaque ? `0 0 12px ${item.cor}60` : "none",
              }}>
                {item.ano}
              </div>

              {/* Card */}
              <div style={{
                flex: 1,
                background: item.destaque ? `${item.cor}10` : C.surface,
                border: `1px solid ${item.destaque ? item.cor + "40" : C.line}`,
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 2,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: item.cor }}>{item.titulo}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 99,
                      background: `${item.cor}20`, color: item.cor, border: `1px solid ${item.cor}40`,
                      fontWeight: 700, whiteSpace: "nowrap",
                    }}>
                      {item.ibsCbs}
                    </span>
                    <span style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 99,
                      background: `${C.inkMuted}15`, color: C.inkMuted,
                      border: `1px solid ${C.line}`, whiteSpace: "nowrap",
                    }}>
                      ICMS/ISS: {item.icmsIss}
                    </span>
                  </div>
                </div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {item.items.map((it, i) => (
                    <li key={i} style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.6, marginBottom: 2 }}>{it}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Info boxes ───────────────────────────────────────────────────────── */}
      <InfoBox color={C.amber} title="⚡ SPLIT PAYMENT">
        A partir de 2027, o IBS e a CBS serão retidos e recolhidos automaticamente pelas instituições financeiras no momento do pagamento das transações.
        O contribuinte <strong>não precisará recolher o imposto via DARF</strong>; em contrapartida, o crédito do comprador só se realizará após o efetivo pagamento ao fornecedor.
        O caixa das empresas deve ser planejado considerando que o pagamento líquido do cliente chega descontado do imposto.
      </InfoBox>

      <InfoBox color={C.leaf} title="🏢 SIMPLES NACIONAL NA REFORMA">
        Empresas do Simples poderão optar pelo regime híbrido (recolher IBS/CBS fora do DAS com crédito pleno) ou manter o recolhimento unificado dentro do DAS.
        A escolha afeta diretamente a cadeia produtiva: optantes pelo DAS podem gerar crédito limitado aos compradores, dependendo da regulamentação final.
        Aguardar LC complementar ao art. 18 da LC 123/2006 para o impacto definitivo.
      </InfoBox>

      <InfoBox color="#60A5FA" title="📋 CRÉDITO FINANCEIRO PLENO (2027+)">
        O modelo IBS/CBS adota crédito financeiro: <strong>toda aquisição de bens ou serviços tributada pelo regime gera crédito</strong>, inclusive ativos imobilizados e despesas gerais.
        Isso é fundamentalmente diferente do modelo atual do Lucro Presumido (sem crédito de PIS/COFINS) e aproxima-se do Lucro Real não-cumulativo,
        mas sem a restrição da lista de insumos da Lei 10.637/2002.
      </InfoBox>

      <div style={{
        background: C.surface, border: `1px solid ${C.line}`,
        borderRadius: 10, padding: "12px 16px", fontSize: 11, color: C.inkMuted, lineHeight: 1.6,
      }}>
        <strong style={{ color: C.ink }}>Nota:</strong> As alíquotas definitivas de IBS e CBS serão estabelecidas por resolução do Comitê Gestor do IBS e por lei ordinária federal.
        A estimativa de ≈ 27% é referência técnica; o valor exato depende de calibragem para manutenção da carga tributária atual.
        Fontes: EC 132/2023 | LC 214/2025 (regulamentação em andamento) | Relatório Ministério da Fazenda 2024.
      </div>
    </div>
  );
}
