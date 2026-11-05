import { z, type ZodErrorMap } from 'zod';

/** Nomes amigáveis dos campos que aparecem nas mensagens de validação. */
const CAMPOS: Record<string, string> = {
  steps: 'Etapas', documents: 'Anexos', items: 'Itens do POP', name: 'Nome', title: 'Título', regimes: 'Regimes', email: 'E-mail',
  password: 'Senha', document: 'CNPJ/CPF', dueDay: 'Dia do prazo', dueDate: 'Vencimento', competence: 'Competência', clientId: 'Cliente',
  ids: 'Seleção', changes: 'Alterações', hours: 'Horários', phone: 'Telefone', body: 'Texto', reason: 'Motivo',
};

function campo(path: (string | number)[]) {
  const named = [...path].reverse().find((p) => typeof p === 'string') as string | undefined;
  const idx = path.find((p) => typeof p === 'number') as number | undefined;
  const base = named ? CAMPOS[named] ?? named : 'Campo';
  return idx !== undefined && named && path.indexOf(named) > path.indexOf(idx) ? `${base} (item ${idx + 1})` : base;
}

/** Mensagens de validação em português, com o nome do campo (em vez de "Array must contain at least 1 element(s)"). */
export const errorMapPt: ZodErrorMap = (issue, ctx) => {
  const c = campo(issue.path);
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' || issue.received === 'null' ? `${c}: obrigatório` : `${c}: valor inválido` };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'array') return { message: `${c}: informe pelo menos ${issue.minimum}` };
      if (issue.type === 'string') return { message: `${c}: mínimo de ${issue.minimum} caractere(s)` };
      return { message: `${c}: valor mínimo ${issue.minimum}` };
    case z.ZodIssueCode.too_big:
      if (issue.type === 'array') return { message: `${c}: no máximo ${issue.maximum}` };
      if (issue.type === 'string') return { message: `${c}: máximo de ${issue.maximum} caracteres` };
      return { message: `${c}: valor máximo ${issue.maximum}` };
    case z.ZodIssueCode.invalid_string:
      return { message: `${c}: formato inválido` };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `${c}: opção inválida` };
    default:
      return { message: `${c}: ${ctx.defaultError}` };
  }
};

z.setErrorMap(errorMapPt);
