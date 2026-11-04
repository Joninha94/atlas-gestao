/**
 * Catálogo global de obrigações (modelos de processo). Cada escritório pode duplicar e ajustar;
 * cada cliente pode ligar/desligar qualquer item (aba "Obrigações" do cliente).
 *
 * COMO LER UM ITEM
 *   regimes        quem entra por padrão (vazio = todos)
 *   ufs            só clientes dessas UFs (vazio = todas)
 *   optIn          não entra sozinho: o time ativa no cliente que tem a obrigação (ex.: IPI, DIMOB, DMED)
 *   dueDay         dia do prazo; 31 = último dia do mês (o sistema antecipa fim de semana e feriado → último dia útil)
 *   dueBusinessDay N-ésimo dia útil (prevalece sobre dueDay)
 *   dueMonthOffset meses após a competência (1 = mês seguinte)
 *   postpone       prazo em dia não útil vai para o próximo dia útil (padrão é antecipar)
 *   ANUAL          recurrenceMonth = mês do prazo; competência = ano-base (prazo no ano seguinte),
 *                  ou o próprio ano com dueSameYear (13º, férias coletivas, taxas municipais)
 *
 * ⚠️ Prazos conferidos em nov/2026 com a legislação e agendas públicas citadas em `notes`.
 *    Legislação muda: o time fiscal deve revisar este arquivo todo ano (e a cada prorrogação).
 */
import type { TaxRegime } from '../src';

export type Obrigacao = {
  name: string; category: string; dept: 'Fiscal' | 'Contábil' | 'Pessoal' | 'Societário' | 'Financeiro';
  regimes: TaxRegime[]; ufs?: string[]; optIn?: boolean;
  dueDay: number; dueBusinessDay?: number; dueMonthOffset?: number; postpone?: boolean;
  recurrence?: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | 'NENHUMA'; recurrenceMonth?: number; dueSameYear?: boolean;
  fine?: boolean; monitorLink?: 'SIMPLES' | 'MEI' | 'DCTFWEB' | 'FGTS' | 'PARCELAMENTOS';
  steps: string[]; cascade?: boolean; notes?: string; hours?: number;
};

const SN: TaxRegime[] = ['SIMPLES_NACIONAL'];
const LP: TaxRegime[] = ['LUCRO_PRESUMIDO'];
const LR: TaxRegime[] = ['LUCRO_REAL'];
const LP_LR: TaxRegime[] = ['LUCRO_PRESUMIDO', 'LUCRO_REAL'];
const PJ: TaxRegime[] = ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA'];
/** Obrigações de folha: MEI fica fora por padrão (ative no MEI que tiver empregado). */
const FOLHA: TaxRegime[] = PJ;
const PF: TaxRegime[] = ['PESSOA_FISICA'];

/** Nomes antigos → novos (o seed renomeia o modelo global em vez de duplicar). */
export const RENAMES: Record<string, string> = {
  'RAIS / informe de rendimentos': 'Informe de rendimentos (colaboradores)',
  'DCTFWeb': 'DCTFWeb (previdenciária)',
  'Apuração PIS/COFINS': 'PIS/COFINS (DARF)',
  'IRPJ/CSLL trimestral': 'IRPJ/CSLL trimestral (Presumido)',
};

export const OBRIGACOES: Obrigacao[] = [
  // ========================================================================= SIMPLES NACIONAL / MEI
  { name: 'PGDAS-D e DAS', category: 'Simples Nacional', dept: 'Fiscal', regimes: SN, dueDay: 20, fine: true, monitorLink: 'SIMPLES', cascade: true,
    steps: ['Conferir faturamento (notas de saída e serviços)', 'Transmitir PGDAS-D', 'Enviar DAS ao cliente'],
    notes: 'LC 123/2006, art. 21 e Res. CGSN 140/2018. Vence dia 20; em dia não útil, antecipa.' },
  { name: 'DAS-MEI', category: 'MEI', dept: 'Fiscal', regimes: ['MEI'], dueDay: 20, monitorLink: 'MEI', steps: ['Enviar DAS-MEI ao cliente'] },
  { name: 'Controle do limite de faturamento (Simples/MEI)', category: 'Simples Nacional', dept: 'Fiscal', regimes: ['SIMPLES_NACIONAL', 'MEI'], dueDay: 15,
    steps: ['Conferir RBT12 e sublimite no Monitor', 'Avisar cliente se passar de 80% do limite'],
    notes: 'Sublimite estadual/municipal de R$ 3,6 mi e limite do MEI. O Monitor já calcula a régua.' },
  { name: 'DeSTDA', category: 'Estadual', dept: 'Fiscal', regimes: SN, dueDay: 20, postpone: true, fine: true,
    steps: ['Apurar ICMS-ST, DIFAL e antecipação', 'Gerar e transmitir DeSTDA no SEDIF-SN'],
    notes: 'Ajuste SINIEF 12/2015: dia 20 do mês seguinte; dia não útil posterga. Só para contribuinte do ICMS (com IE) — desligue nos prestadores de serviço e nas UFs que dispensaram.' },
  { name: 'ICMS antecipação / DIFAL (Simples)', category: 'Estadual', dept: 'Fiscal', regimes: SN, dueDay: 9, optIn: true,
    steps: ['Conferir notas de entrada interestaduais', 'Calcular antecipação/DIFAL', 'Enviar guia ao cliente'],
    notes: 'Comércio que compra de outra UF. Prazo varia por UF e mercadoria — AL: confira no RICMS/AL e nos avisos da SEFAZ-AL.' },
  { name: 'DEFIS', category: 'Simples Nacional', dept: 'Fiscal', regimes: SN, dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 3, fine: true,
    steps: ['Levantar informações socioeconômicas', 'Transmitir DEFIS', 'Enviar recibo ao cliente'], notes: 'Res. CGSN 140/2018, art. 72: até 31 de março.' },
  { name: 'DASN-SIMEI', category: 'MEI', dept: 'Fiscal', regimes: ['MEI'], dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 5, fine: true,
    steps: ['Conferir faturamento anual', 'Transmitir DASN-SIMEI'], notes: 'Até 31 de maio.' },
  { name: 'Opção / exclusão do Simples Nacional (revisão anual)', category: 'Simples Nacional', dept: 'Fiscal', regimes: ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI'], dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 1, dueSameYear: true,
    steps: ['Simular regimes (Simples × Presumido × Real × híbrido CBS/IBS)', 'Apresentar recomendação ao cliente', 'Fazer a opção no Portal do Simples (se for o caso)'],
    notes: 'Opção pelo Simples até o último dia útil de janeiro. Use o simulador de reforma (Notas → Reforma).', hours: 3 },

  // ========================================================================= FEDERAL — MENSAIS
  { name: 'DCTFWeb (previdenciária)', category: 'Federal', dept: 'Pessoal', regimes: FOLHA, dueDay: 31, fine: true, monitorLink: 'DCTFWEB', cascade: true,
    steps: ['Conferir eventos do eSocial e da EFD-Reinf', 'Transmitir DCTFWeb', 'Enviar DARF ao cliente'],
    notes: 'IN RFB 2.248/2025: entrega até o último dia útil do mês seguinte. O DARF previdenciário vence dia 20.' },
  { name: 'DCTFWeb MIT (IRPJ, CSLL, PIS, COFINS, IPI)', category: 'Federal', dept: 'Fiscal', regimes: LP_LR, dueDay: 31, fine: true,
    steps: ['Lançar débitos no MIT', 'Transmitir DCTFWeb', 'Enviar recibo ao cliente'],
    notes: 'Desde 01/2025 os tributos da antiga DCTF vão pelo MIT na DCTFWeb: último dia útil do mês seguinte.' },
  { name: 'EFD-Reinf', category: 'Federal', dept: 'Fiscal', regimes: [...SN, ...LP_LR], dueDay: 15, fine: true,
    steps: ['Lançar serviços tomados com retenção e pagamentos (R-4000)', 'Transmitir EFD-Reinf'],
    notes: 'Até o dia 15 do mês seguinte; dia não útil antecipa.' },
  { name: 'EFD-Contribuições', category: 'Federal', dept: 'Fiscal', regimes: LP_LR, dueDay: 10, dueBusinessDay: 10, dueMonthOffset: 2, fine: true,
    steps: ['Apurar PIS/COFINS', 'Validar no PVA', 'Transmitir'], notes: '10º dia útil do 2º mês seguinte (IN RFB 1.252/2012).' },
  { name: 'PIS/COFINS (DARF)', category: 'Federal', dept: 'Fiscal', regimes: LP_LR, dueDay: 25, fine: true,
    steps: ['Apurar PIS e COFINS', 'Gerar DARF', 'Enviar ao cliente'], notes: 'Dia 25 do mês seguinte; dia não útil antecipa.' },
  { name: 'IRRF e retenções federais (DARF)', category: 'Federal', dept: 'Fiscal', regimes: LP_LR, dueDay: 20, fine: true,
    steps: ['Conferir retenções de IRRF e CSRF (PIS/COFINS/CSLL)', 'Gerar DARF', 'Enviar ao cliente'],
    notes: 'Dia 20 do mês seguinte (antecipa). Retenções na EFD-Reinf; IRRF sobre folha vai pela DCTFWeb.' },
  { name: 'IRPJ/CSLL estimativa mensal (Lucro Real)', category: 'Federal', dept: 'Contábil', regimes: LR, dueDay: 31, fine: true,
    steps: ['Levantar balancete de suspensão/redução', 'Calcular estimativa', 'Gerar DARF e enviar ao cliente'],
    notes: 'Último dia útil do mês seguinte. Desligue se a empresa apura o Real trimestral.' },
  { name: 'IPI (apuração)', category: 'Federal', dept: 'Fiscal', regimes: LP_LR, dueDay: 25, optIn: true, fine: true,
    steps: ['Apurar IPI', 'Gerar DARF', 'Enviar ao cliente'], notes: 'Indústria e equiparados. Dia 25 do mês seguinte (antecipa).' },
  { name: 'CPRB (desoneração da folha)', category: 'Federal', dept: 'Pessoal', regimes: LP_LR, dueDay: 20, optIn: true,
    steps: ['Calcular CPRB sobre a receita', 'Informar na EFD-Reinf (R-2060)', 'Enviar DARF ao cliente'],
    notes: 'Só para setores desonerados (Lei 12.546/2011 e reoneração gradual da Lei 14.973/2024).' },
  { name: 'DIRBI', category: 'Federal', dept: 'Fiscal', regimes: LP_LR, dueDay: 20, dueMonthOffset: 2, optIn: true, fine: true,
    steps: ['Levantar benefícios fiscais usufruídos', 'Transmitir DIRBI'], notes: 'Dia 20 do 2º mês seguinte. Só para quem usufrui benefício listado pela RFB.' },
  { name: 'Reforma tributária: CBS/IBS nas notas', category: 'Federal', dept: 'Fiscal', regimes: LP_LR, dueDay: 10,
    steps: ['Conferir destaque de CBS/IBS nas notas emitidas', 'Corrigir cadastros de produto/serviço (cClassTrib)'],
    notes: 'LC 214/2025: em 2026 é ano-teste (CBS 0,9% e IBS 0,1% destacados, sem recolhimento se as obrigações acessórias forem cumpridas).' },

  // ========================================================================= FEDERAL — TRIMESTRAIS
  { name: 'IRPJ/CSLL trimestral (Presumido)', category: 'Federal', dept: 'Fiscal', regimes: LP, dueDay: 31, recurrence: 'TRIMESTRAL', fine: true,
    steps: ['Apurar IRPJ e CSLL', 'Gerar DARF (cota única ou 3 quotas)', 'Enviar ao cliente'], notes: 'Último dia útil do mês seguinte ao trimestre.' },
  { name: 'IRPJ/CSLL trimestral (Lucro Real)', category: 'Federal', dept: 'Contábil', regimes: LR, dueDay: 31, recurrence: 'TRIMESTRAL', optIn: true, fine: true,
    steps: ['Fechar balancete do trimestre', 'Calcular LALUR/LACS', 'Gerar DARF e enviar ao cliente'], notes: 'Para quem optou pelo Real trimestral (desligue a estimativa mensal).' },
  { name: 'Distribuição de lucros (controle)', category: 'Contábil', dept: 'Contábil', regimes: [...SN, ...LP_LR], dueDay: 31, recurrence: 'TRIMESTRAL', optIn: true,
    steps: ['Apurar lucro distribuível', 'Emitir recibo/ata de distribuição'], notes: 'Lucro isento exige escrituração (Lei 9.249/1995). Confirmar regras de tributação de dividendos vigentes.' },

  // ========================================================================= FEDERAL — ANUAIS
  { name: 'ECD', category: 'Contábil', dept: 'Contábil', regimes: LP_LR, dueDay: 30, recurrence: 'ANUAL', recurrenceMonth: 6, fine: true, cascade: true,
    steps: ['Encerrar exercício', 'Gerar e validar ECD', 'Assinar e transmitir'], notes: 'Último dia útil de junho.' },
  { name: 'ECF', category: 'Contábil', dept: 'Contábil', regimes: LP_LR, dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 7, fine: true,
    steps: ['Importar ECD', 'Preencher blocos', 'Transmitir ECF'], notes: 'Último dia útil de julho.' },
  { name: 'DIMOB', category: 'Federal', dept: 'Fiscal', regimes: PJ, dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 2, optIn: true, fine: true,
    steps: ['Levantar locações, intermediações e vendas de imóveis', 'Transmitir DIMOB'], notes: 'Imobiliárias, construtoras e administradoras. Último dia útil de fevereiro.' },
  { name: 'DMED', category: 'Federal', dept: 'Fiscal', regimes: PJ, dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 2, optIn: true, fine: true,
    steps: ['Levantar recebimentos de pessoas físicas', 'Transmitir DMED'], notes: 'Clínicas, consultórios, laboratórios e planos de saúde. Último dia útil de fevereiro.' },
  { name: 'Informe de rendimentos (PJ prestadora)', category: 'Federal', dept: 'Fiscal', regimes: LP_LR, dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 2, optIn: true,
    steps: ['Gerar informes de retenções a fornecedores', 'Enviar aos beneficiários'], notes: 'Para quem reteve IRRF/CSRF de terceiros. Último dia útil de fevereiro.' },
  { name: 'CBE (capitais brasileiros no exterior)', category: 'Federal', dept: 'Contábil', regimes: [...PJ, ...PF], dueDay: 5, recurrence: 'ANUAL', recurrenceMonth: 4, optIn: true,
    steps: ['Levantar ativos no exterior em 31/12', 'Declarar no Banco Central'], notes: 'Banco Central: quem tinha ≥ US$ 1 milhão no exterior em 31/12. Conferir janela anual do BCB.' },
  { name: 'ITR', category: 'Federal', dept: 'Fiscal', regimes: [...PJ, ...PF], dueDay: 30, recurrence: 'ANUAL', recurrenceMonth: 9, dueSameYear: true, optIn: true, fine: true,
    steps: ['Levantar dados do imóvel rural (CAR, VTN)', 'Transmitir DITR', 'Enviar DARF/quotas ao cliente'], notes: 'Proprietários de imóvel rural. Último dia útil de setembro.' },

  // ========================================================================= ESTADUAL (contribuintes do ICMS)
  { name: 'Apuração ICMS', category: 'Estadual', dept: 'Fiscal', regimes: LP_LR, dueDay: 9, fine: true,
    steps: ['Apurar ICMS próprio e ST', 'Gerar guia', 'Enviar ao cliente'],
    notes: 'AL: dia 9 do mês seguinte (RICMS/AL, art. 101). Outras UFs: ajuste o dia no modelo do escritório. Desligue em empresas sem IE.' },
  { name: 'EFD ICMS/IPI (SPED Fiscal)', category: 'Estadual', dept: 'Fiscal', regimes: LP_LR, dueDay: 25, fine: true,
    steps: ['Importar XMLs', 'Validar no PVA', 'Transmitir'],
    notes: 'AL: dia 25 do mês seguinte (IN SEF 19/2009, art. 12). Outras UFs costumam usar dia 15 ou 20 — duplique o modelo para a UF.' },
  { name: 'Inventário de estoque (31/12)', category: 'Estadual', dept: 'Fiscal', regimes: [...SN, ...LP_LR], dueDay: 25, recurrence: 'ANUAL', recurrenceMonth: 2, optIn: true,
    steps: ['Solicitar inventário ao cliente', 'Conferir valores com a contabilidade', 'Informar no Bloco H da EFD de fevereiro'], notes: 'Comércio e indústria com estoque.' },
  { name: 'GIA-ST (substituto em outra UF)', category: 'Estadual', dept: 'Fiscal', regimes: [...SN, ...LP_LR], dueDay: 10, optIn: true,
    steps: ['Apurar ICMS-ST retido para a UF de destino', 'Transmitir GIA-ST'], notes: 'Para quem tem inscrição de substituto tributário em outra UF.' },
  { name: 'Conferência de notas de entrada (SEFAZ × escrituração)', category: 'Estadual', dept: 'Fiscal', regimes: [...SN, ...LP_LR], dueDay: 5,
    steps: ['Comparar notas capturadas (Notas) com as escrituradas', 'Manifestar desconhecimento de notas indevidas'],
    notes: 'Use a captura automática do módulo Notas. Evita autuação por nota não escriturada.' },

  // ========================================================================= MUNICIPAL (prestadores de serviço)
  { name: 'Apuração ISS', category: 'Municipal', dept: 'Fiscal', regimes: LP_LR, dueDay: 10, fine: true,
    steps: ['Conferir NFS-e prestadas e tomadas', 'Gerar guia', 'Enviar ao cliente'], notes: 'Prazo varia por município — confirme na prefeitura (Maceió: SEMEC) e ajuste o modelo do escritório.' },
  { name: 'ISS retido sobre serviços tomados', category: 'Municipal', dept: 'Fiscal', regimes: [...SN, ...LP_LR], dueDay: 10, optIn: true,
    steps: ['Identificar serviços tomados com retenção', 'Gerar guia de ISS retido', 'Enviar ao cliente'], notes: 'Substitutos tributários conforme legislação municipal.' },
  { name: 'Declaração mensal de serviços (prefeitura)', category: 'Municipal', dept: 'Fiscal', regimes: [...SN, ...LP_LR], dueDay: 10, optIn: true,
    steps: ['Escriturar serviços prestados e tomados no portal da prefeitura', 'Encerrar a competência'], notes: 'Municípios que ainda exigem declaração (DMS/DES). Onde há só NFS-e Nacional, não ative.' },
  { name: 'ISS fixo (autônomos e sociedades de profissionais)', category: 'Municipal', dept: 'Fiscal', regimes: [...PJ, ...PF], dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 1, dueSameYear: true, optIn: true,
    steps: ['Emitir carnê do ISS fixo', 'Enviar ao cliente'], notes: 'Sociedades uniprofissionais e autônomos com ISS fixo. Datas pelo calendário do município.' },
  { name: 'Taxa de licença e funcionamento (alvará)', category: 'Municipal', dept: 'Societário', regimes: [...PJ, 'MEI'], dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 3, dueSameYear: true, optIn: true,
    steps: ['Emitir guia da taxa (TLF)', 'Enviar ao cliente', 'Arquivar alvará renovado no Drive'], notes: 'Maceió cobra a TLF anualmente; confira o calendário da prefeitura.' },
  { name: 'Licenças sanitária e do Corpo de Bombeiros', category: 'Municipal', dept: 'Societário', regimes: [...PJ, 'MEI'], dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 3, dueSameYear: true, optIn: true,
    steps: ['Conferir vencimento das licenças', 'Solicitar renovação', 'Arquivar no Drive'], notes: 'Para atividades sujeitas a vigilância sanitária/AVCB.' },

  // ========================================================================= PESSOAL — MENSAIS
  { name: 'Folha de pagamento', category: 'Pessoal', dept: 'Pessoal', regimes: FOLHA, dueDay: 5, dueBusinessDay: 5, cascade: true,
    steps: ['Receber variáveis do cliente', 'Calcular folha', 'Enviar holerites e relatório ao cliente'], notes: 'Salário até o 5º dia útil do mês seguinte (CLT, art. 459).' },
  { name: 'Pró-labore', category: 'Pessoal', dept: 'Pessoal', regimes: [...SN, ...LP_LR], dueDay: 5, dueBusinessDay: 5,
    steps: ['Calcular pró-labore', 'Enviar recibo ao cliente'] },
  { name: 'eSocial (fechamento)', category: 'Pessoal', dept: 'Pessoal', regimes: FOLHA, dueDay: 15, fine: true,
    steps: ['Enviar eventos periódicos (S-1200/S-1210)', 'Fechar competência (S-1299)'], notes: 'Até o dia 15 do mês seguinte.' },
  { name: 'FGTS Digital', category: 'Pessoal', dept: 'Pessoal', regimes: FOLHA, dueDay: 20, fine: true, monitorLink: 'FGTS',
    steps: ['Conferir guia', 'Enviar guia ao cliente'], notes: 'Lei 14.438/2022: dia 20 do mês seguinte (antecipa).' },
  { name: 'Adiantamento salarial (vale)', category: 'Pessoal', dept: 'Pessoal', regimes: FOLHA, dueDay: 20, dueMonthOffset: 0, optIn: true,
    steps: ['Calcular adiantamento', 'Enviar relatório ao cliente'], notes: 'Quando previsto em convenção ou política da empresa.' },
  { name: 'Vale-transporte e benefícios (pedido)', category: 'Pessoal', dept: 'Pessoal', regimes: FOLHA, dueDay: 25, dueMonthOffset: 0, optIn: true,
    steps: ['Atualizar dias úteis e admitidos', 'Gerar pedido de VT/VA/VR', 'Enviar ao cliente'] },
  { name: 'Controle de férias e aviso de vencimento', category: 'Pessoal', dept: 'Pessoal', regimes: FOLHA, dueDay: 10,
    steps: ['Listar períodos aquisitivos vencendo em 60 dias', 'Avisar cliente para programar férias'], notes: 'Férias vencidas pagam em dobro (CLT, art. 137).' },
  { name: 'SST no eSocial (ASO e riscos)', category: 'Pessoal', dept: 'Pessoal', regimes: FOLHA, dueDay: 15, optIn: true,
    steps: ['Conferir ASOs do mês (S-2220)', 'Atualizar condições ambientais (S-2240)'], notes: 'S-2220/S-2240 até o dia 15 do mês seguinte ao exame/alteração.' },
  { name: 'Contribuição sindical / assistencial', category: 'Pessoal', dept: 'Pessoal', regimes: FOLHA, dueDay: 10, optIn: true,
    steps: ['Conferir convenção coletiva', 'Descontar/recolher se autorizado'], notes: 'Depende de autorização e da convenção da categoria.' },

  // ========================================================================= PESSOAL — ANUAIS
  { name: '13º salário — 1ª parcela', category: 'Pessoal', dept: 'Pessoal', regimes: FOLHA, dueDay: 30, recurrence: 'ANUAL', recurrenceMonth: 11, dueSameYear: true,
    steps: ['Calcular 1ª parcela', 'Enviar recibos e relatório ao cliente'], notes: 'Até 30 de novembro (Lei 4.749/1965).' },
  { name: '13º salário — 2ª parcela', category: 'Pessoal', dept: 'Pessoal', regimes: FOLHA, dueDay: 20, recurrence: 'ANUAL', recurrenceMonth: 12, dueSameYear: true, fine: true,
    steps: ['Calcular 2ª parcela e encargos', 'Enviar recibos, DCTFWeb e FGTS do 13º ao cliente'], notes: 'Até 20 de dezembro; DCTFWeb do 13º também vence dia 20/12.' },
  { name: 'Informe de rendimentos (colaboradores)', category: 'Pessoal', dept: 'Pessoal', regimes: FOLHA, dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 2,
    steps: ['Gerar informes', 'Enviar aos colaboradores'], notes: 'Último dia útil de fevereiro. (RAIS e DIRF foram substituídas pelo eSocial/EFD-Reinf.)' },
  { name: 'Férias coletivas (programação)', category: 'Pessoal', dept: 'Pessoal', regimes: FOLHA, dueDay: 15, recurrence: 'ANUAL', recurrenceMonth: 11, dueSameYear: true, optIn: true,
    steps: ['Consultar cliente', 'Comunicar órgão do trabalho e sindicato (15 dias antes)', 'Calcular férias'] },
  { name: 'Contribuição sindical patronal', category: 'Pessoal', dept: 'Pessoal', regimes: PJ, dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 1, dueSameYear: true, optIn: true,
    steps: ['Conferir se a empresa autorizou', 'Emitir guia', 'Enviar ao cliente'], notes: 'Facultativa desde a Lei 13.467/2017.' },

  // ========================================================================= CONTÁBIL
  { name: 'Conciliação bancária', category: 'Contábil', dept: 'Contábil', regimes: [...SN, ...LP_LR], dueDay: 25,
    steps: ['Importar extratos', 'Conciliar', 'Revisar pendências com o cliente'] },
  { name: 'Lançamentos contábeis do mês', category: 'Contábil', dept: 'Contábil', regimes: [...SN, ...LP_LR, 'IMUNE_ISENTA'], dueDay: 28,
    steps: ['Importar folha, notas e extratos', 'Classificar lançamentos', 'Conferir saldos'] },
  { name: 'Balancete mensal', category: 'Contábil', dept: 'Contábil', regimes: LP_LR, dueDay: 30, cascade: true,
    steps: ['Fechar lançamentos', 'Emitir balancete', 'Enviar ao cliente'] },
  { name: 'Demonstrações contábeis anuais (Balanço e DRE)', category: 'Contábil', dept: 'Contábil', regimes: [...SN, ...LP_LR, 'IMUNE_ISENTA'], dueDay: 30, recurrence: 'ANUAL', recurrenceMonth: 4,
    steps: ['Encerrar o exercício', 'Emitir Balanço, DRE e notas explicativas', 'Colher assinaturas'], notes: 'Base para aprovação de contas (sócios) até 30 de abril.' },
  { name: 'Aprovação de contas (ata/reunião de sócios)', category: 'Societário', dept: 'Societário', regimes: [...SN, ...LP_LR], dueDay: 30, recurrence: 'ANUAL', recurrenceMonth: 4, optIn: true,
    steps: ['Minutar ata', 'Colher assinaturas', 'Registrar na Junta (se exigido)'], notes: 'Código Civil, art. 1.078: até 4 meses após o fim do exercício.' },
  { name: 'Imunes e isentas: prestação de contas', category: 'Contábil', dept: 'Contábil', regimes: ['IMUNE_ISENTA'], dueDay: 30, recurrence: 'ANUAL', recurrenceMonth: 4,
    steps: ['Fechar demonstrações', 'Preparar prestação de contas à assembleia/órgão', 'Enviar ao cliente'] },

  // ========================================================================= PESSOA FÍSICA
  { name: 'Declaração de IRPF', category: 'Pessoa Física', dept: 'Fiscal', regimes: PF, dueDay: 31, recurrence: 'ANUAL', recurrenceMonth: 5,
    steps: ['Solicitar documentos ao cliente', 'Importar pré-preenchida', 'Transmitir e enviar recibo/DARF'], notes: 'Último dia útil de maio (confirmar a IN anual da RFB).', hours: 2 },
  { name: 'Carnê-leão', category: 'Pessoa Física', dept: 'Fiscal', regimes: PF, dueDay: 31, optIn: true,
    steps: ['Lançar rendimentos de PF/exterior e despesas', 'Gerar DARF', 'Enviar ao cliente'], notes: 'Último dia útil do mês seguinte.' },
  { name: 'Ganho de capital (GCAP)', category: 'Pessoa Física', dept: 'Fiscal', regimes: PF, dueDay: 31, optIn: true,
    steps: ['Apurar ganho na alienação', 'Gerar DARF', 'Enviar ao cliente'], notes: 'Último dia útil do mês seguinte à venda. Ative só no mês da operação.' },

  // ========================================================================= PARCELAMENTOS / ROTINAS DO ESCRITÓRIO
  { name: 'Parcelamentos', category: 'Federal', dept: 'Fiscal', regimes: [...SN, 'MEI', ...LP_LR], dueDay: 31, dueMonthOffset: 1, monitorLink: 'PARCELAMENTOS',
    steps: ['Enviar parcela ao cliente'], notes: 'Só gera para clientes com parcelamento cadastrado no Monitor.' },
  { name: 'Renovação de certidões negativas', category: 'Federal', dept: 'Fiscal', regimes: [...PJ, 'MEI'], dueDay: 5, optIn: true,
    steps: ['Conferir certidões no Monitor', 'Tratar pendências que impedem a emissão'], notes: 'Para clientes que participam de licitação ou dependem de CND.' },
  { name: 'Caixa postal (e-CAC, DTE estadual, DET)', category: 'Federal', dept: 'Fiscal', regimes: [...PJ, 'MEI'], dueDay: 10,
    steps: ['Ler mensagens novas no Monitor', 'Abrir tarefa para intimações e avisos'], notes: 'O sistema nunca dá ciência automática: alguém precisa abrir e registrar.' },
  { name: 'Fechamento do mês com o cliente', category: 'Financeiro', dept: 'Financeiro', regimes: [...SN, ...LP_LR], dueDay: 5, optIn: true,
    steps: ['Cobrar documentos pendentes (notas, extratos, folha)', 'Registrar o que faltou no app do cliente'] },
  { name: 'Honorários do escritório', category: 'Financeiro', dept: 'Financeiro', regimes: [], dueDay: 5, dueMonthOffset: 0, optIn: true,
    steps: ['Emitir boleto/NFS-e de honorários', 'Enviar ao cliente pelo app/WhatsApp'] },

  // ========================================================================= AVULSOS (aplicados manualmente no cliente)
  { name: 'Admissão de colaborador', category: 'Pessoal', dept: 'Pessoal', regimes: [], dueDay: 1, recurrence: 'NENHUMA', cascade: true,
    steps: ['Receber documentos', 'Exame admissional', 'Registrar no eSocial (S-2200) antes do início', 'Enviar contrato ao cliente'] },
  { name: 'Rescisão sem justa causa', category: 'Pessoal', dept: 'Pessoal', regimes: [], dueDay: 1, recurrence: 'NENHUMA', cascade: true,
    steps: ['Calcular rescisão', 'Gerar guia FGTS rescisória', 'Enviar TRCT e guias ao cliente'], notes: 'Pagamento em até 10 dias do término (CLT, art. 477).' },
  { name: 'Rescisão por justa causa / pedido de demissão', category: 'Pessoal', dept: 'Pessoal', regimes: [], dueDay: 1, recurrence: 'NENHUMA', cascade: true,
    steps: ['Conferir documentação do motivo', 'Calcular verbas', 'Enviar TRCT ao cliente'] },
  { name: 'Férias individuais', category: 'Pessoal', dept: 'Pessoal', regimes: [], dueDay: 1, recurrence: 'NENHUMA',
    steps: ['Calcular férias', 'Enviar aviso e recibo ao cliente (pagamento 2 dias antes)'] },
  { name: 'Afastamento / licença', category: 'Pessoal', dept: 'Pessoal', regimes: [], dueDay: 1, recurrence: 'NENHUMA',
    steps: ['Receber atestado/documento', 'Informar no eSocial (S-2230)', 'Orientar cliente sobre INSS'] },
  { name: 'Abertura de empresa', category: 'Societário', dept: 'Societário', regimes: [], dueDay: 1, recurrence: 'NENHUMA', cascade: true,
    steps: ['Viabilidade', 'Registro na Junta', 'CNPJ', 'Inscrições estadual/municipal', 'Alvará', 'Cadastrar no sistema'] },
  { name: 'Alteração contratual', category: 'Societário', dept: 'Societário', regimes: [], dueDay: 1, recurrence: 'NENHUMA', cascade: true,
    steps: ['Minuta', 'Assinaturas', 'Registro na Junta', 'Atualizar cadastros'] },
  { name: 'Baixa de empresa', category: 'Societário', dept: 'Societário', regimes: [], dueDay: 1, recurrence: 'NENHUMA', cascade: true,
    steps: ['Levantar pendências fiscais', 'Distrato na Junta', 'Baixa no CNPJ, IE e IM', 'Entregar declarações de encerramento'] },
  { name: 'Transformação MEI em ME', category: 'Societário', dept: 'Societário', regimes: [], dueDay: 1, recurrence: 'NENHUMA', cascade: true,
    steps: ['Comunicar desenquadramento do SIMEI', 'Alterar natureza na Junta', 'Atualizar cadastros e obrigações no sistema'] },
  { name: 'Procuração e-CAC (cadastro/renovação)', category: 'Societário', dept: 'Fiscal', regimes: [], dueDay: 1, recurrence: 'NENHUMA',
    steps: ['Orientar cliente a outorgar procuração', 'Verificar no sistema (Clientes → Verificar procuração)'] },
  { name: 'Renovação de certificado digital', category: 'Societário', dept: 'Societário', regimes: [], dueDay: 1, recurrence: 'NENHUMA',
    steps: ['Agendar validação', 'Instalar e cadastrar o novo A1 no sistema'] },
  { name: 'Parcelamento de débitos (adesão)', category: 'Federal', dept: 'Fiscal', regimes: [], dueDay: 1, recurrence: 'NENHUMA', cascade: true,
    steps: ['Levantar débitos (situação fiscal)', 'Simular modalidades', 'Aderir e cadastrar no Monitor'] },
  { name: 'Atendimento a intimação / fiscalização', category: 'Federal', dept: 'Fiscal', regimes: [], dueDay: 1, recurrence: 'NENHUMA', cascade: true,
    steps: ['Ler intimação e prazo', 'Reunir documentos', 'Protocolar resposta'] },
  { name: 'Restituição / compensação (PER/DCOMP)', category: 'Federal', dept: 'Fiscal', regimes: [], dueDay: 1, recurrence: 'NENHUMA',
    steps: ['Levantar crédito', 'Transmitir PER/DCOMP', 'Acompanhar despacho'] },
  { name: 'Declaração de faturamento / DECORE', category: 'Contábil', dept: 'Contábil', regimes: [], dueDay: 1, recurrence: 'NENHUMA',
    steps: ['Levantar faturamento ou rendimentos', 'Emitir declaração/DECORE', 'Enviar ao cliente'] },
];
