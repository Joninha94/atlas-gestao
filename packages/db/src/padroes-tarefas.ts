/**
 * Padrões das Configurações de Tarefas: POPs sugeridos, modelos de mensagem, colunas do quadro e fluxos.
 * Tudo é editável pelo escritório em Tarefas → Configurar. O seed só cria o que ainda não existe.
 */

/** POPs (Procedimento Operacional Padrão) sugeridos. `templates` = obrigações onde o POP já vem ligado. */
export const POPS: { title: string; description: string; dept: string; templates: string[]; items: string[] }[] = [
  {
    title: 'POP — Apuração do Simples Nacional (PGDAS-D)',
    dept: 'Fiscal',
    description: 'Conferências obrigatórias antes de transmitir o PGDAS-D e enviar o DAS ao cliente.',
    templates: ['PGDAS-D e DAS'],
    items: [
      'Importar e conferir as notas de saída do mês (canceladas e devoluções excluídas)',
      'Conferir notas de serviço tomadas com ISS retido',
      'Separar receitas por anexo e atividade (CNAE) — monofásicos e ST destacados',
      'Conferir o fator R (folha dos últimos 12 meses) quando houver Anexo V',
      'Verificar o sublimite e o limite de faturamento acumulado (RBT12)',
      'Transmitir o PGDAS-D e salvar o recibo',
      'Gerar o DAS e conferir valor e vencimento',
      'Anexar o DAS e o extrato na tarefa',
    ],
  },
  {
    title: 'POP — Fechamento da folha de pagamento',
    dept: 'Pessoal',
    description: 'Roteiro de fechamento da folha antes de enviar holerites e guias.',
    templates: ['Folha de pagamento', 'eSocial (fechamento)'],
    items: [
      'Receber do cliente as variáveis do mês (faltas, horas extras, comissões, atestados)',
      'Lançar admissões, rescisões e férias do período',
      'Conferir salário mínimo e piso da convenção coletiva',
      'Calcular a folha e conferir INSS, IRRF e FGTS de cada colaborador',
      'Transmitir os eventos periódicos no eSocial (S-1200/S-1210) e fechar (S-1299)',
      'Gerar holerites, resumo da folha e guias (DCTFWeb e FGTS Digital)',
      'Anexar holerites e guias na tarefa',
    ],
  },
  {
    title: 'POP — DCTFWeb',
    dept: 'Pessoal',
    description: 'Transmissão da DCTFWeb e emissão do DARF.',
    templates: ['DCTFWeb (previdenciária)', 'DCTFWeb MIT (IRPJ, CSLL, PIS, COFINS, IPI)'],
    items: [
      'Confirmar o fechamento do eSocial e da EFD-Reinf do período',
      'Conferir créditos, compensações e suspensões',
      'Transmitir a DCTFWeb e salvar o recibo',
      'Emitir o DARF e conferir o valor com o resumo da folha',
      'Anexar o DARF e o recibo na tarefa',
    ],
  },
  {
    title: 'POP — Conciliação bancária',
    dept: 'Contábil',
    description: 'Conciliação mensal dos extratos com a contabilidade.',
    templates: ['Conciliação bancária', 'Lançamentos contábeis do mês'],
    items: [
      'Receber os extratos de todas as contas e aplicações',
      'Importar o OFX e classificar os lançamentos',
      'Conferir saldo final do extrato × saldo contábil',
      'Listar pendências (lançamentos sem documento) e pedir ao cliente',
      'Registrar a conciliação no sistema contábil',
    ],
  },
  {
    title: 'POP — Abertura de empresa',
    dept: 'Societário',
    description: 'Checklist de abertura do primeiro contato ao alvará.',
    templates: ['Abertura de empresa'],
    items: [
      'Consulta de viabilidade (nome e endereço) aprovada',
      'Documentos dos sócios conferidos (RG, CPF, comprovante de residência)',
      'Contrato social redigido e assinado',
      'Registro na Junta Comercial e CNPJ emitido',
      'Inscrição estadual e/ou municipal',
      'Alvará de funcionamento e licenças',
      'Opção pelo Simples Nacional (se for o caso)',
      'Certificado digital e procuração e-CAC',
    ],
  },
];

/** Modelos de mensagem padrão. Variáveis: {{cliente}}, {{contato}}, {{tarefa}}, {{competencia}}, {{vencimento}}, {{escritorio}}, {{link}}, {{responsavel}}. */
export const MENSAGENS: { event: string; channel: 'EMAIL' | 'WHATSAPP' | 'APP'; subject?: string; body: string }[] = [
  {
    event: 'TAREFA_CONCLUIDA', channel: 'EMAIL',
    subject: '{{tarefa}} — {{competencia}} concluída',
    body: 'Olá, {{contato}}!\n\nConcluímos a tarefa "{{tarefa}}" da competência {{competencia}} para {{cliente}}.\n{{anexos}}\nOs documentos também estão disponíveis no aplicativo: {{link}}\n\nQualquer dúvida, é só responder este e-mail.\n\n{{escritorio}}',
  },
  {
    event: 'TAREFA_CONCLUIDA', channel: 'WHATSAPP',
    body: 'Olá, {{contato}}! ✅ Concluímos *{{tarefa}}* ({{competencia}}) de {{cliente}}.{{anexos}}\nVeja no app: {{link}}\n— {{escritorio}}',
  },
  {
    event: 'TAREFA_CONCLUIDA', channel: 'APP',
    subject: '✅ {{tarefa}} concluída',
    body: '{{competencia}} · {{cliente}}. Toque para ver os documentos.',
  },
];

/** Colunas padrão do quadro (Kanban). */
export const ETAPAS: { name: string; color: string; status: 'A_FAZER' | 'EM_PROGRESSO' | 'CONCLUIDO' }[] = [
  { name: 'A fazer', color: '#94a3b8', status: 'A_FAZER' },
  { name: 'Em andamento', color: '#3b82f6', status: 'EM_PROGRESSO' },
  { name: 'Aguardando cliente', color: '#f59e0b', status: 'EM_PROGRESSO' },
  { name: 'Revisão', color: '#8b5cf6', status: 'EM_PROGRESSO' },
  { name: 'Concluído', color: '#10b981', status: 'CONCLUIDO' },
];

/** Fluxos de exemplo (passos = nomes de modelos; o seed troca por ids). */
export const FLUXOS: { name: string; description: string; steps: { template: string; delayDays: number }[] }[] = [
  {
    name: 'Fechamento mensal do Departamento Pessoal',
    description: 'Folha → eSocial → DCTFWeb → FGTS: cada etapa nasce quando a anterior é concluída.',
    steps: [
      { template: 'Folha de pagamento', delayDays: 0 },
      { template: 'eSocial (fechamento)', delayDays: 0 },
      { template: 'DCTFWeb (previdenciária)', delayDays: 0 },
      { template: 'FGTS Digital', delayDays: 0 },
    ],
  },
  {
    name: 'Abertura de empresa completa',
    description: 'Abertura → procuração e-CAC → certificado digital.',
    steps: [
      { template: 'Abertura de empresa', delayDays: 0 },
      { template: 'Procuração e-CAC (cadastro/renovação)', delayDays: 0 },
      { template: 'Renovação de certificado digital', delayDays: 0 },
    ],
  },
];

export const DOCUMENTOS: { name: string; category: string; body: string }[] = [
  {
    name: 'Declaração de responsabilidade técnica',
    category: 'Declarações',
    body: 'Declaramos, para os devidos fins, que a empresa {{cliente.razao_social}}, inscrita no CNPJ {{cliente.cnpj}}, com sede em {{cliente.endereco}}, {{cliente.cidade}}/{{cliente.uf}}, tem sua escrituração contábil e fiscal sob a responsabilidade técnica deste escritório desde {{cliente.inicio_contrato}}.\n\nPor ser verdade, firmamos a presente.',
  },
  {
    name: 'Carta de solicitação de documentos',
    category: 'Comunicados',
    body: 'Prezado(a) {{cliente.representante}},\n\nPara concluirmos as obrigações da competência {{competencia}} de {{cliente.razao_social}}, solicitamos o envio dos seguintes documentos até {{data_limite}}:\n\n• Extratos bancários de todas as contas\n• Notas fiscais de entrada e saída\n• Variáveis da folha de pagamento\n\nOs documentos podem ser enviados pelo aplicativo ou por e-mail.',
  },
];

/** Anexos de cada obrigação (o que precisa estar na tarefa para poder enviar ao cliente). */
export type AnexoModelo = { id: string; name: string; required: boolean; send: boolean };
const a = (id: string, name: string, required = true, send = true): AnexoModelo => ({ id, name, required, send });
export const ANEXOS_POR_MODELO: Record<string, AnexoModelo[]> = {
  'PGDAS-D e DAS': [a('das', 'DAS'), a('recibo', 'Recibo'), a('extrato', 'Extrato do Simples'), a('declaracao', 'Declaração')],
  'DAS-MEI': [a('das', 'DAS-MEI')],
  'DCTFWeb (previdenciária)': [a('recibo', 'Recibo da DCTFWeb'), a('darf', 'DARF')],
  'DCTFWeb MIT (IRPJ, CSLL, PIS, COFINS, IPI)': [a('recibo', 'Recibo da DCTFWeb'), a('darf', 'DARF')],
  'FGTS Digital': [a('guia', 'Guia do FGTS')],
  'Folha de pagamento': [a('holerites', 'Holerites'), a('resumo', 'Resumo da folha'), a('relatorio', 'Relatório de encargos', false)],
  'Pró-labore': [a('recibo', 'Recibo de pró-labore')],
  'EFD-Reinf': [a('recibo', 'Recibo da EFD-Reinf')],
  'DeSTDA': [a('recibo', 'Recibo da DeSTDA'), a('guia', 'Guia de ICMS', false)],
  'Apuração ICMS': [a('apuracao', 'Livro de apuração', true, false), a('guia', 'Guia de ICMS')],
  'Apuração ISS': [a('guia', 'Guia do ISS')],
  'PIS/COFINS (DARF)': [a('darf', 'DARF')],
  'DEFIS': [a('recibo', 'Recibo da DEFIS'), a('declaracao', 'Declaração')],
  'DASN-SIMEI': [a('recibo', 'Recibo da DASN-SIMEI')],
  'Balancete mensal': [a('balancete', 'Balancete')],
  'Demonstrações contábeis anuais (Balanço e DRE)': [a('balanco', 'Balanço Patrimonial'), a('dre', 'DRE')],
  'Declaração de IRPF': [a('recibo', 'Recibo'), a('declaracao', 'Declaração'), a('darf', 'DARF (quotas)', false)],
};
