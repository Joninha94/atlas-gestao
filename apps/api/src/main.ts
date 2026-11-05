import 'reflect-metadata';
import { initObservability } from './common/observability';
initObservability('api');
import { NestFactory } from '@nestjs/core';
import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { ZodError } from 'zod';
import './common/zod-pt';
import { AppModule } from './app.module';
import { assertSafeConfig } from './config';
import { captureError } from './common/observability';

/** Erros de validação (Zod) viram 400; "não encontrado" do Prisma vira 404; o resto vira 500 sem vazar detalhes. */
@Catch()
class ErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('Erro');

  catch(e: any, host: ArgumentsHost) {
    if (host.getType() !== 'http') return;
    const res = host.switchToHttp().getResponse();
    if (e instanceof ZodError) return res.status(400).json(new BadRequestException({ message: 'Dados inválidos', issues: e.issues }).getResponse());
    if (e instanceof HttpException) return res.status(e.getStatus()).json(e.getResponse());
    if (e?.code === 'P2025' || e?.name === 'NotFoundError') return res.status(404).json({ statusCode: 404, message: 'Registro não encontrado.' });
    if (e?.code === 'P2002') return res.status(409).json({ statusCode: 409, message: 'Registro já existe.' });
    if (e?.code === 'P2003') return res.status(400).json({ statusCode: 400, message: 'Referência inválida.' });
    this.log.error(e?.stack ?? e);
    captureError(e, { path: host.switchToHttp().getRequest()?.route?.path });
    return res.status(500).json({ statusCode: 500, message: 'Erro interno.' });
  }
}

async function bootstrap() {
  assertSafeConfig();
  // rawBody: necessário para validar a assinatura do webhook do WhatsApp
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true, credentials: true });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3333);
  await app.listen(port);
  new Logger('API').log(`Produtiva Gestão API em :${port}${process.env.INTEGRATIONS_MODE === 'sandbox' ? ' (sandbox)' : ''}`);
}

bootstrap();
