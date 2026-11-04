import { createHash } from 'node:crypto';
import { simplePdf } from '../pdf.util';
import type { IntegraResponse, Party, ServiceRef } from './integra-contador.client';

/**
 * Respostas simuladas do Integra Contador, determinísticas por CNPJ + período.
 * Os formatos seguem o que o MonitorService consome; os valores são fictícios.
 */
const pagamentosSimulados: { taxpayer: string; numeroDocumento: string; dataArrecadacao: string; valorTotal: number; periodoApuracao: string; codigoReceita: string }[] = [];

export function sandboxRegisterPayment(p: (typeof pagamentosSimulados)[number]) {
  pagamentosSimulados.push(p);
}

const seed = (s: string) => parseInt(createHash('sha1').update(s).digest('hex').slice(0, 8), 16);
const money = (n: number) => Math.round(n * 100) / 100;

export async function serproSandbox<T>(service: ServiceRef, taxpayer: Party, dados: Record<string, any>): Promise<IntegraResponse<T>> {
  const ok = (d: unknown) => ({ status: 200, mensagens: [{ codigo: 'Sucesso', texto: 'SANDBOX' }], dados: d as T });
  const pa: string = String(dados.periodoApuracao ?? `${dados.anoPA ?? ''}${dados.mesPA ?? ''}`);
  const s = seed(`${taxpayer.numero}:${pa}`);
  const comp = pa.length === 6 ? `${pa.slice(4, 6)}/${pa.slice(0, 4)}` : pa;
  const due = pa.length === 6 ? new Date(Date.UTC(Number(pa.slice(0, 4)), Number(pa.slice(4, 6)), 20)).toISOString().slice(0, 10) : '';
  const consolidation = dados.dataConsolidacao ? `${dados.dataConsolidacao.slice(0, 4)}-${dados.dataConsolidacao.slice(4, 6)}-${dados.dataConsolidacao.slice(6, 8)}` : undefined;
  const lateDays = consolidation ? Math.max(0, (Date.parse(consolidation) - Date.parse(due)) / 86_400_000) : 0;

  switch (service.idServico) {
    case 'CONSDECLARACAO13':
      return ok({ listaPeriodos: Array.from({ length: 12 }, (_, i) => ({ periodoApuracao: `${dados.anoCalendario}${String(i + 1).padStart(2, '0')}` })) });

    case 'GERARDAS12': {
      const principal = money(800 + (s % 420000) / 100);
      const fine = money(Math.min(principal * 0.0033 * lateDays, principal * 0.2));
      const interest = money(lateDays > 0 ? principal * 0.01 : 0);
      const pdf = await simplePdf('Documento de Arrecadação do Simples Nacional (SIMULADO)', [
        ['Contribuinte', taxpayer.numero], ['Período de apuração', comp], ['Vencimento', consolidation ?? due],
        ['Principal', principal.toFixed(2)], ['Multa', fine.toFixed(2)], ['Juros', interest.toFixed(2)],
        ['Total', (principal + fine + interest).toFixed(2)], '', 'Documento gerado em modo sandbox. Não pagar.',
      ]);
      return ok({
        pdf: pdf.toString('base64'),
        detalhamento: [{ dataVencimento: consolidation ?? due, valores: { principal, multa: fine, juros: interest }, codigoDeBarras: `8586${String(s).padStart(40, '0').slice(0, 40)}` }],
      });
    }

    case 'GERARDASPDF21': {
      const total = 81.05;
      const pdf = await simplePdf('DAS-MEI (SIMULADO)', [['Contribuinte', taxpayer.numero], ['Período', comp], ['Vencimento', consolidation ?? due], ['Total', total.toFixed(2)]]);
      return ok({ pdf: pdf.toString('base64'), detalhamento: [{ dataVencimento: consolidation ?? due, valores: { total } }] });
    }

    case 'CONSRECIBO32':
      return ok({
        pisCofinsMesmoPeriodo: s % 2 === 0,
        debitos: [
          { revenueCode: '1082', kind: 'PREVIDENCIARIO', amount: money(1500 + (s % 300000) / 100) },
          { revenueCode: '8109', kind: 'PIS', amount: money(120 + (s % 9000) / 100) },
          { revenueCode: '2172', kind: 'COFINS', amount: money(560 + (s % 40000) / 100) },
        ],
      });

    case 'GERARGUIA31': {
      const pdf = await simplePdf('DARF numerado DCTFWeb (SIMULADO)', [['Contribuinte', taxpayer.numero], ['Competência', comp], ['Vencimento', `${due}`]]);
      return ok({ PDFByteArrayBase64: pdf.toString('base64') });
    }

    case 'TRANSDECLARACAO38':
      return ok({ numeroRecibo: `SBX${s}` });

    case 'PAGAMENTOS71':
      return ok(pagamentosSimulados.filter((p) => p.taxpayer === taxpayer.numero));

    case 'MSGCONTRIBUINTE61':
      return ok({
        conteudo: [
          { isn: `${s}01`, assuntoModelo: 'Termo de Exclusão do Simples Nacional', remetente: 'Receita Federal', dataEnvio: '2026-10-28', indicadorLeitura: '0', relevancia: '2' },
          { isn: `${s}02`, assuntoModelo: 'Comunicado: atualização cadastral', remetente: 'Receita Federal', dataEnvio: '2026-09-15', indicadorLeitura: '0', relevancia: '1' },
        ],
      });

    case 'MSGDETALHAMENTO62':
      return ok({ assunto: 'Mensagem simulada', corpo: 'Conteúdo da mensagem da caixa postal (sandbox).' });

    case 'SOLICITARPROTOCOLO91':
      return ok({ protocoloRelatorio: `PROT${s}`, tempoEspera: 0 });

    case 'RELATORIOSITFIS92': {
      const pend = s % 3 === 0;
      const pdf = await simplePdf('Relatório de Situação Fiscal (SIMULADO)', [['Contribuinte', taxpayer.numero], ['Situação', pend ? 'Pendências encontradas' : 'Sem pendências']]);
      return ok({ pdf: pdf.toString('base64'), pendencias: pend });
    }

    case 'OBTERPROCURACAO41':
      return ok([{ dtexpiracao: '20271231', sistemas: ['PGDASD', 'PGMEI', 'DCTFWEB', 'CAIXAPOSTAL', 'PAGTOWEB', 'SITFIS'] }]);

    default:
      return ok({});
  }
}
