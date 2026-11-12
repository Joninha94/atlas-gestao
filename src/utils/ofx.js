// Parser de arquivos OFX (Open Financial Exchange) — formato usado pelos bancos
// brasileiros para exportar extrato. Suporta OFX 1.x (SGML, sem fechamento de
// tags folha) e OFX 2.x (XML válido). Funciona sem biblioteca externa.

// Extrai um campo de um bloco SGML/XML.
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}>([^<\n\r]*)`, "i"));
  return m ? m[1].trim() : "";
}

// Converte data OFX (YYYYMMDDHHMMSS[-TZ] ou YYYYMMDD) para ISO "YYYY-MM-DD".
function ofxDate(str) {
  if (!str) return null;
  const d = str.replace(/\[.*/, "").trim();
  if (d.length < 8) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

// Limpa o campo MEMO dos bancos brasileiros — o BB (e outros) costuma incluir
// data/hora e CPF/CNPJ antes do nome real do estabelecimento ou pessoa.
// Ex.: "01/06 09:42 03043698452 ERNANDE FERREI" → "ERNANDE FERREI"
//       "30/05 11:38 ZAMOA MARAGOGI"            → "ZAMOA MARAGOGI"
function cleanMemo(memo) {
  if (!memo) return "";
  return memo
    // Remove prefixo de data+hora  "DD/MM HH:MM " ou "DD/MM/AAAA HH:MM "
    .replace(/^\d{2}\/\d{2}(?:\/\d{2,4})?\s+\d{2}:\d{2}\s*/i, "")
    // Remove CPF (11 dígitos) ou CNPJ (14 dígitos) isolado no início
    .replace(/^\d{11,14}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Movimentações internas do banco que NÃO representam receita ou despesa real:
// investimentos automáticos (BB Rende Fácil, RF LP Selic/High), entradas de
// saldo, cobranças de juros/IOF de conta especial, tarifas de pacote, etc.
// Essas linhas devem ser ignoradas na importação.
const INTERNAL_PATTERNS = [
  /RENDE\s?FACIL/i,
  /BB\s?RF\s?LP/i,
  /BB\s?RENDE/i,
  /^SALDO\s+(DO\s+DIA|ANTERIOR|FINAL|$)/i,
  /^JUROS\s+SALDO\s+DEVEDOR/i,
  /^IOF\s+SALDO\s+DEVEDOR/i,
  /^COBRANCA\s+DE\s+JUROS/i,
  /^COBRANCA\s+DE\s+I\.?O\.?F/i,
];

function isInternalMovement(raw, cleaned) {
  const check = (s) => INTERNAL_PATTERNS.some((p) => p.test(s));
  return check(raw) || check(cleaned);
}

// Detecta padrão de parcelas na descrição do extrato de cartão.
// Ex.: "MLP*Magalu Ma PARC 10/10" → { current: 10, total: 10 }
//       "FM SERVICO PARC 09/12"   → { current: 9, total: 12 }
export function detectInstallments(description) {
  const m = description.match(/PARC\s+(\d+)\/(\d+)/i);
  if (!m) return null;
  return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
}

// Sugere uma categoria Atlas a partir da descrição limpa do extrato.
// Para receitas desconhecidas retorna "" (vazio) — assim o usuário vê
// explicitamente que precisa escolher, em vez de receber "Outros" que
// não existe nas categorias de receita.
function autoCategory(description, isCredit) {
  const d = (description || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  if (isCredit) {
    if (/SALARIO|REMUNER/.test(d))           return "Salário";
    if (/FREELA|CONSULTORIA|HONORARIO/.test(d)) return "Freelancer";
    if (/DIVIDENDO|JCP/.test(d))             return "Dividendos";
    if (/ALUGUEL/.test(d))                   return "Aluguel de imóvel";
    if (/PROLABORE|PRO.LABORE/.test(d))      return "Pró-labore";
    if (/RESCISAO|FERIAS/.test(d))           return "Férias";
    if (/13\s*(SALARIO|SAL)|DECIMO/.test(d)) return "13º salário";
    if (/CASHBACK|REEMBOLSO/.test(d))        return "Cashback";
    if (/RESTITUICAO|INDENIZ/.test(d))       return "Indenizações";
    if (/PENSAO/.test(d))                    return "Pensão";
    if (/APOSENTADORIA/.test(d))             return "Aposentadoria";
    if (/RENDIMENTO|APLICACAO|RESGATE/.test(d)) return "Rendimentos de CDB";
    if (/PRODUTIVA|CONTABILIDADE/.test(d))   return "Outras receitas";
    // Desconhecido → vazio para forçar o usuário a escolher
    return "";
  }

  if (/SUPERMERCADO|MERCADO|ATACADO|CARREFOUR|ASSAI|GPA/.test(d))   return "Supermercado";
  if (/CESTA\s?DE\s?ALIMENTOS/.test(d))                             return "Supermercado";
  if (/ACOUGUE|BOUTIQUE\s?DAS\s?CARNES|ACOUGUE\s?DA/.test(d))       return "Açougue";
  if (/PADARIA|PANIFICAD|CONFIAN|PAO\b/.test(d))                    return "Padaria";
  if (/POSTO|COMBUSTIV|EUCALYPTO|PETROBR|SHELL|IPIRANGA|MARCOL/.test(d)) return "Combustível";
  if (/FARMACIA|DROGARIA|RAIA|PAGUE\s?MENOS|PACHECO|FARMADERM|FARMACOSTA|RD\s?SAUDE/.test(d)) return "Farmácia";
  if (/MEDICO|DRA\s|DR\s|CLINICA|SAUDE|CONSULTA/.test(d))           return "Consultas médicas";
  if (/RESTAUR|LANCHON|CHURRASCO|PASTEL|GREEN\s?BEER|GULOSEIMAS|MILK/.test(d)) return "Restaurantes";
  if (/DELIVERY|IFOOD|RAPPI/.test(d))                               return "Delivery";
  if (/UBER|99POP|CABIFY|TAXI/.test(d))                             return "Uber/99";
  if (/NETFLIX|SPOTIFY|GLOBOPLAY|DISNEY|YOUTUBE|PRIME\s?VIDEO/.test(d)) return "Streaming de vídeo";
  if (/EQUATORIAL|ENEL|CEMIG|COPEL|CELESC|LIGHT\b|COELBA|ENERGISA/.test(d)) return "Energia elétrica";
  if (/BRK\s?AMBIENTAL|SABESP|CASAN|COPASA|SANEPAR|AGUA\b/.test(d)) return "Água";
  if (/CLARO|TELEFONICA|VIVO\b|TIM\b|OI\b|NET\b|ALGAR|BRISANET/.test(d)) return "Internet";
  if (/SMARTFIT|BODYTECH|BLUEFIT|ACADEMIA|GYMPASS/.test(d))         return "Academia";
  if (/TARIFA|IOF\b|PACOTE\s?DE\s?SERV/.test(d))                   return "Tarifas bancárias";
  if (/CREDITO\s?VEICULO|CRED\s?VEI/.test(d))                      return "Financiamentos";
  if (/CARTAO\s?CREDITO|VOTORANTIM|LUIZACRED|PEFISA/.test(d))       return "Fatura do cartão";
  if (/AMAZON|SHOPEE|MERCADOLIVR|SHPP/.test(d))                     return "Compras";
  if (/BOTICARIO|COSMETICO/.test(d))                                return "Cosméticos";
  if (/RECEITA\s?FEDERAL|PREFEITURA|IPTU|IMPOSTO/.test(d))          return "Impostos e Taxas";
  if (/SINDICATO|ASSOCIACAO|MC\s?ASSOCI/.test(d))                   return "Outros";
  if (/MIDWAY/.test(d))                                             return "Financiamentos";
  if (/DONAT|LBV\b/.test(d))                                        return "Igreja";
  return "Outros";
}

// Parseia o arquivo OFX/OFC e devolve a lista de transações prontas para o Atlas.
// Cada transação: { id, date, amount, isCredit, description, category }
export function parseOFX(text) {
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Detecta se é OFX de cartão de crédito (CREDITCARDMSGSRSV1 / CCSTMTRS)
  const isCreditCard = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(src);

  const startDate = ofxDate(tag(src, "DTSTART"));
  const endDate   = ofxDate(tag(src, "DTEND"));
  const bankId    = tag(src, "BANKID");
  // Cartões usam CCACCTFROM > ACCTID; contas correntes usam BANKACCTFROM > BANKID/ACCTID
  const acctId    = tag(src, "ACCTID");

  const transactions = [];
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const block  = m[1];
    const amtStr = tag(block, "TRNAMT").replace(",", ".");
    const amt    = parseFloat(amtStr);
    if (isNaN(amt)) continue;

    const date = ofxDate(tag(block, "DTPOSTED"));
    if (!date) continue;

    const rawMemo = tag(block, "MEMO") || tag(block, "NAME") || "";
    const cleaned = cleanMemo(rawMemo);

    // Descarta movimentações internas do banco (Rende Fácil, RF LP, etc.)
    if (isInternalMovement(rawMemo, cleaned)) continue;

    // Em fatura de cartão: descarta pagamentos/créditos (o que o usuário pagou
    // para quitar a fatura — não são compras, só reduzem o saldo devedor)
    if (isCreditCard && amt > 0) continue;

    // Em OFX de cartão de crédito: TRNAMT negativo = compra (débito no cartão)
    // Em OFX de conta corrente: TRNAMT positivo = crédito/recebimento
    const isCredit    = isCreditCard ? amt < 0 : amt > 0;
    const description = cleaned || (isCredit ? "Crédito" : "Débito");

    transactions.push({
      id:       tag(block, "FITID") || String(Math.random()),
      date,
      amount:   Math.abs(amt),
      isCredit,
      description,
      category: autoCategory(description, isCredit),
    });
  }

  if (transactions.length === 0) {
    throw new Error(
      "Nenhuma transação encontrada no arquivo. Confirme que é um OFX válido exportado pelo seu banco."
    );
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));

  const ledgerBalMatch = src.match(/<BALAMT>([^\n<]+)/i);
  const closingBalance = ledgerBalMatch
    ? parseFloat(ledgerBalMatch[1].trim().replace(",", "."))
    : null;

  return { transactions, startDate, endDate, bankId, acctId, closingBalance, isCreditCard };
}

// Lê o arquivo, tenta decodificar como UTF-8 e, se falhar, como Windows-1252
// (encoding comum em bancos brasileiros). Retorna o resultado do parseOFX.
export function readAndParseOFX(file) {
  return new Promise((resolve, reject) => {
    const tryParse = (text) => {
      try { resolve(parseOFX(text)); }
      catch (e) { reject(e); }
    };

    const readerUTF = new FileReader();
    readerUTF.onload = (e) => {
      const text = e.target.result;
      if (/<STMTTRN>/i.test(text)) {
        tryParse(text);
      } else {
        const reader1252 = new FileReader();
        reader1252.onload = (e2) => tryParse(e2.target.result);
        reader1252.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
        reader1252.readAsText(file, "windows-1252");
      }
    };
    readerUTF.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    readerUTF.readAsText(file, "utf-8");
  });
}
