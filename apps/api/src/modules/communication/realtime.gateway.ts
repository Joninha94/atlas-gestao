import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { NotificationsService } from '../../integrations/notifications.service';

/**
 * Tempo real (Socket.IO): mensagens novas, fila de atendimento, chat interno, sinalização
 * de chamadas e alertas do sino. Voz/vídeo/tela usam LiveKit (token em POST /comm/internal/channels/:id/call).
 */
@WebSocketGateway({ cors: { origin: process.env.WEB_ORIGIN?.split(',') ?? true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server?: Server;

  constructor(private readonly jwt: JwtService, notifications: NotificationsService) {
    notifications.onCreated((n) => (n.userId ? this.emitToUser(n.userId, 'notification', n) : this.emitToTenant(n.tenantId, 'notification', n)));
  }

  handleConnection(socket: Socket) {
    try {
      const user = this.jwt.verify<{ sub: string; tenantId: string; role: string }>(String(socket.handshake.auth?.token ?? ''));
      if (user.role === 'CLIENTE') socket.join(`contact:${user.sub}`);
      else {
        socket.join(`tenant:${user.tenantId}`);
        socket.join(`user:${user.sub}`);
      }
    } catch {
      socket.disconnect(true);
    }
  }

  emitToTenant(tenantId: string, event: string, payload: unknown) {
    this.server?.to(`tenant:${tenantId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    for (const id of userIds) this.emitToUser(id, event, payload);
  }

  emitToContact(contactId: string, event: string, payload: unknown) {
    this.server?.to(`contact:${contactId}`).emit(event, payload);
  }
}
