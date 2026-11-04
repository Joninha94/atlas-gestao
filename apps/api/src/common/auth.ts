import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, NestMiddleware, SetMetadata, UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { tenantContext } from './tenant-context';

export type Role = 'ADMIN' | 'GESTOR' | 'COLABORADOR' | 'CLIENTE';
export type PlanName = 'ESSENCIAL' | 'PROFISSIONAL' | 'ENTERPRISE';

export interface AuthUser {
  sub: string; // userId (escritório) ou contactId (cliente)
  tenantId: string;
  role: Role;
  clientId?: string; // só para CLIENTE (app)
  name?: string;
  permissions: string[];
  plan: PlanName;
}

/** Permissões finas por módulo e ação. ADMIN tem todas. */
export const PERMISSIONS = {
  MONITOR_VIEW: 'monitor:ver',
  MONITOR_RECALC: 'monitor:recalcular',
  MONITOR_PARAMS: 'monitor:parametros',
  MAILBOX_CIENCIA: 'mailbox:dar_ciencia',
  COMM_ATTEND: 'comunicacao:atender',
  COMM_BROADCAST: 'comunicacao:transmissao',
  COMM_ADMIN: 'comunicacao:configurar',
  XML_VIEW: 'xml:ver',
  XML_MANIFEST: 'xml:manifestar',
  TASKS_MANAGE: 'tarefas:gerenciar',
  TASKS_DISMISS: 'tarefas:dispensar',
  DRIVE_SHARE: 'drive:compartilhar',
  CLIENTS_MANAGE: 'clientes:gerenciar',
  CERT_DOWNLOAD: 'certificado:baixar',
  USERS_MANAGE: 'usuarios:gerenciar',
  SETTINGS: 'configuracoes:editar',
} as const;

export const ROLE_PERMISSIONS: Record<Exclude<Role, 'CLIENTE'>, string[]> = {
  ADMIN: Object.values(PERMISSIONS),
  GESTOR: [
    PERMISSIONS.MONITOR_VIEW, PERMISSIONS.MONITOR_RECALC, PERMISSIONS.MAILBOX_CIENCIA, PERMISSIONS.COMM_ATTEND,
    PERMISSIONS.COMM_BROADCAST, PERMISSIONS.XML_VIEW, PERMISSIONS.XML_MANIFEST, PERMISSIONS.TASKS_MANAGE,
    PERMISSIONS.TASKS_DISMISS, PERMISSIONS.DRIVE_SHARE, PERMISSIONS.CLIENTS_MANAGE,
  ],
  COLABORADOR: [PERMISSIONS.MONITOR_VIEW, PERMISSIONS.COMM_ATTEND, PERMISSIONS.XML_VIEW],
};

const REQUIRED_PERMISSION = 'required_permission';
const REQUIRED_PLAN = 'required_plan';
const PUBLIC = 'public_route';
const CLIENT_ROUTE = 'client_route';

export const RequirePermission = (p: string) => SetMetadata(REQUIRED_PERMISSION, p);
export const RequirePlan = (plan: 'PROFISSIONAL' | 'ENTERPRISE') => SetMetadata(REQUIRED_PLAN, plan);
export const Public = () => SetMetadata(PUBLIC, true);
/** Rotas do app do cliente: só tokens com role CLIENTE. As demais rotas recusam CLIENTE. */
export const ClientRoute = () => SetMetadata(CLIENT_ROUTE, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

/**
 * Lê o JWT (se houver), valida e executa o resto da requisição dentro do contexto do escritório.
 * Rotas sem token seguem sem contexto (o AuthGuard decide se são públicas).
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request & { user?: AuthUser }, _res: Response, next: NextFunction) {
    const header = String(req.headers.authorization ?? '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (token) {
      try {
        req.user = this.jwt.verify<AuthUser>(token);
      } catch {
        req.user = undefined;
      }
    }
    tenantContext.run({ tenantId: req.user?.tenantId, userId: req.user?.sub }, () => next());
  }
}

const PLAN_RANK: Record<PlanName, number> = { ESSENCIAL: 0, PROFISSIONAL: 1, ENTERPRISE: 2 };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true; // WebSocket valida no próprio gateway
    const handlers = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, handlers)) return true;

    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException();

    const isClientRoute = !!this.reflector.getAllAndOverride<boolean>(CLIENT_ROUTE, handlers);
    if (isClientRoute !== (user.role === 'CLIENTE')) throw new ForbiddenException();

    const perm = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION, handlers);
    if (perm && user.role !== 'ADMIN' && !user.permissions.includes(perm)) {
      throw new ForbiddenException(`Permissão necessária: ${perm}`);
    }
    const plan = this.reflector.getAllAndOverride<PlanName>(REQUIRED_PLAN, handlers);
    if (plan && PLAN_RANK[user.plan] < PLAN_RANK[plan]) {
      throw new ForbiddenException(`Recurso disponível no plano ${plan}.`);
    }
    return true;
  }
}
