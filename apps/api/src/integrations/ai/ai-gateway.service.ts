import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Camada única de IA. Todo uso de LLM passa por aqui para mascarar dados, registrar custo,
 * aplicar limites por plano e trocar de provedor sem mexer nos módulos.
 * NUNCA enviar certificados, senhas ou tokens.
 *
 * Sem ANTHROPIC_API_KEY, cada função usa uma regra simples (palavras-chave) — o sistema continua
 * funcionando, só que com menos inteligência. Útil em desenvolvimento e como fallback.
 */
@Injectable()
export class AiGatewayService {
  private readonly log = new Logger(AiGatewayService.name);
  private readonly client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
  private readonly model = process.env.AI_MODEL ?? 'claude-sonnet-5-5';

  get enabled() {
    return !!this.client;
  }

  private async complete(system: string, user: string, maxTokens = 800): Promise<string> {
    const res = await this.client!.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  }

  private async json<T>(system: string, user: string, maxTokens = 800): Promise<T> {
    const text = await this.complete(`${system}\nResponda SOMENTE com JSON válido, sem texto extra.`, user, maxTokens);
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as T;
  }

  /** Reescreve a mensagem do atendente: tom amigável ou profissional. */
  async rewrite(text: string, tone: 'AMIGAVEL' | 'PROFISSIONAL') {
    if (!this.client) {
      const t = text.trim().replace(/\s+/g, ' ');
      const cap = t.charAt(0).toUpperCase() + t.slice(1);
      return tone === 'AMIGAVEL' ? `Olá! ${cap}${/[.!?]$/.test(cap) ? '' : '.'} Qualquer dúvida, estamos à disposição. 😊` : `Prezado(a), ${cap.charAt(0).toLowerCase() + cap.slice(1)}${/[.!?]$/.test(cap) ? '' : '.'} Permanecemos à disposição.`;
    }
    return this.complete(
      'Você reescreve mensagens de um escritório de contabilidade para clientes, em português do Brasil. Mantenha fatos, valores e datas exatamente iguais. Devolva só a mensagem.',
      `Tom desejado: ${tone === 'AMIGAVEL' ? 'amigável e próximo' : 'profissional e objetivo'}.\nMensagem:\n${text}`,
    );
  }

  /** URA: escolhe o departamento a partir de texto livre. Não responde ao cliente. */
  async routeToDepartment(text: string, departments: { id: string; name: string; description?: string }[]) {
    if (!this.client) return keywordRoute(text, departments);
    const list = departments.map((d) => `- ${d.id}: ${d.name}${d.description ? ` (${d.description})` : ''}`).join('\n');
    return this.json<{ departmentId: string | null; confidence: number }>(
      'Classifique a mensagem de um cliente de contabilidade no departamento correto. Use null se não houver confiança.',
      `Departamentos:\n${list}\n\nMensagem: """${mask(text)}"""\nFormato: {"departmentId": "...", "confidence": 0-1}`,
      200,
    );
  }

  /** Resumo da conversa no período (pontos do escritório e do cliente). */
  async summarize(transcript: string) {
    if (!this.client) {
      const lines = transcript.split('\n');
      const pick = (who: string) => lines.filter((l) => l.startsWith(`[${who}]`)).map((l) => l.replace(/^\[[^\]]+\]\s*/, '')).slice(-5);
      return { pontosEscritorio: pick('Escritório'), pontosCliente: pick('Cliente'), pendencias: lines.filter((l) => /\?$/.test(l)).map((l) => l.replace(/^\[[^\]]+\]\s*/, '')).slice(-3) };
    }
    return this.json<{ pontosEscritorio: string[]; pontosCliente: string[]; pendencias: string[] }>(
      'Resuma um atendimento entre escritório de contabilidade e cliente.',
      `Transcrição:\n${mask(transcript)}\nFormato: {"pontosEscritorio": [], "pontosCliente": [], "pendencias": []}`,
      1200,
    );
  }

  /** Satisfação inferida (Enterprise): sem perguntar nada ao cliente. */
  async rateSatisfaction(transcript: string, avgResponseSeconds: number) {
    if (!this.client) {
      const agilidade = avgResponseSeconds <= 300 ? 10 : avgResponseSeconds <= 1800 ? 7 : avgResponseSeconds <= 7200 ? 5 : 3;
      const cordialidade = /obrigad|por favor|olá|bom dia|boa tarde/i.test(transcript) ? 9 : 6;
      const clareza = 7;
      const nota = Math.round(((agilidade + cordialidade + clareza) / 3) * 10) / 10;
      return { nota, cordialidade, clareza, agilidade, justificativa: 'Estimativa por regras (IA não configurada).' };
    }
    return this.json<{ nota: number; cordialidade: number; clareza: number; agilidade: number; justificativa: string }>(
      'Avalie a qualidade do atendimento do escritório. Notas de 0 a 10.',
      `Tempo médio de resposta: ${Math.round(avgResponseSeconds / 60)} min.\nTranscrição:\n${mask(transcript)}\nFormato: {"nota":0,"cordialidade":0,"clareza":0,"agilidade":0,"justificativa":""}`,
      600,
    );
  }

  /** Arrasta-e-solta: identifica a etapa da tarefa a partir do conteúdo do documento. */
  async classifyDocument(textSample: string, candidateSteps: { id: string; title: string; hint?: string | null }[]) {
    if (!this.client) {
      const words = (s: string) => new Set(normalize(s).split(/\W+/).filter((w) => w.length > 3));
      const doc = words(textSample);
      let best = { stepId: null as string | null, score: 0 };
      for (const s of candidateSteps) {
        const sw = words(`${s.title} ${s.hint ?? ''}`);
        const score = [...sw].filter((w) => doc.has(w)).length / Math.max(1, sw.size);
        if (score > best.score) best = { stepId: s.id, score };
      }
      return { stepId: best.stepId, documentType: 'desconhecido', confidence: Math.min(1, best.score * 1.5) };
    }
    const list = candidateSteps.map((s) => `- ${s.id}: ${s.title}${s.hint ? ` (${s.hint})` : ''}`).join('\n');
    return this.json<{ stepId: string | null; documentType: string; confidence: number }>(
      'Identifique a que etapa de obrigação contábil este documento pertence.',
      `Etapas possíveis:\n${list}\n\nTrecho do documento:\n"""${mask(textSample.slice(0, 4000))}"""\nFormato: {"stepId":"...","documentType":"...","confidence":0-1}`,
      300,
    );
  }

  /** Cria um modelo de processo (ex.: rescisão por justa causa) para o usuário revisar. */
  async draftProcess(description: string) {
    if (!this.client) {
      return {
        name: description.slice(0, 80),
        category: 'Personalizado',
        steps: [
          { title: 'Levantar documentos e informações', dueOffsetDays: -3, attachment: 'OPCIONAL' },
          { title: 'Executar o procedimento', dueOffsetDays: -1, attachment: 'OBRIGATORIO_PARA_CONCLUIR' },
          { title: 'Enviar comprovantes ao cliente', dueOffsetDays: 0, attachment: 'OBRIGATORIO_CONCLUIR_E_ENVIAR' },
        ],
      };
    }
    return this.json<{ name: string; category: string; steps: { title: string; dueOffsetDays: number; attachment: string }[] }>(
      'Você é especialista em rotinas de escritório contábil brasileiro. Monte um processo com etapas objetivas.',
      `Processo: ${description}\nattachment ∈ OPCIONAL | OBRIGATORIO_PARA_CONCLUIR | OBRIGATORIO_CONCLUIR_E_ENVIAR\nFormato: {"name":"","category":"","steps":[{"title":"","dueOffsetDays":0,"attachment":"OPCIONAL"}]}`,
      1500,
    );
  }

  /** Cria um formulário de ordem de serviço. */
  async draftServiceForm(description: string) {
    if (!this.client) {
      return {
        name: description.slice(0, 80),
        fields: [
          { label: 'Descrição da solicitação', type: 'TEXTO', required: true },
          { label: 'Data desejada', type: 'DATA', required: false },
          { label: 'Documentos', type: 'ANEXO', required: false },
        ],
      };
    }
    return this.json<{ name: string; fields: { label: string; type: string; required: boolean; options?: string[] }[] }>(
      'Monte um formulário que o cliente de um escritório contábil preenche para solicitar um serviço.',
      `Serviço: ${description}\ntype ∈ TEXTO | NUMERO | DATA | MULTIPLA_ESCOLHA | ESCOLHA_UNICA | ANEXO | CPF | CNPJ\nFormato: {"name":"","fields":[{"label":"","type":"TEXTO","required":true}]}`,
      1200,
    );
  }
}

/** Mascara CPFs no texto enviado ao modelo (CNPJ é dado de empresa e ajuda a classificar). */
export function mask(text: string): string {
  return text.replace(/\b(\d{3})\.?\d{3}\.?\d{3}-?(\d{2})\b/g, '$1.***.***-$2');
}

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const KEYWORDS: Record<string, string[]> = {
  fiscal: ['das', 'guia', 'imposto', 'nota', 'nf', 'simples', 'icms', 'iss', 'pgdas', 'darf', 'parcelamento', 'certidao'],
  pessoal: ['folha', 'ferias', 'funcionario', 'colaborador', 'admissao', 'rescisao', 'fgts', 'holerite', 'salario', 'esocial', 'exame'],
  contabil: ['balanco', 'balancete', 'conciliacao', 'extrato', 'contabil', 'dre'],
  societario: ['contrato social', 'alteracao', 'abertura', 'socio', 'junta', 'alvara', 'cnpj'],
  financeiro: ['honorario', 'boleto', 'mensalidade', 'pagamento do escritorio', 'cobranca'],
};

function keywordRoute(text: string, departments: { id: string; name: string }[]) {
  const t = normalize(text);
  let best = { departmentId: null as string | null, confidence: 0 };
  for (const d of departments) {
    const keys = KEYWORDS[normalize(d.name).replace(/\s+/g, '')] ?? [normalize(d.name)];
    const hits = keys.filter((k) => t.includes(k)).length;
    if (hits > 0 && hits / 2 > best.confidence) best = { departmentId: d.id, confidence: Math.min(0.95, 0.5 + hits * 0.2) };
  }
  return best;
}
