import { Body, Controller, Delete, Get, Module, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, PERMISSIONS, Public, RequirePermission, ROLE_PERMISSIONS } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { AuthService } from './auth.service';

const UserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'GESTOR', 'COLABORADOR']),
  password: z.string().min(10).optional(),
  departments: z.array(z.object({ departmentId: z.string().uuid(), isManager: z.boolean().default(false) })).default([]),
  active: z.boolean().optional(),
});

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  @Public()
  @Post('auth/login')
  login(@Body() b: { cnpj: string; email: string; password: string; totp?: string }) {
    return this.auth.login(b.cnpj, b.email, b.password, b.totp);
  }

  @Public()
  @Post('auth/refresh')
  refresh(@Body() b: { refreshToken: string }) {
    return this.auth.refresh(b.refreshToken);
  }

  @Public()
  @Post('auth/logout')
  logout(@Body() b: { refreshToken: string }) {
    return this.auth.logout(b.refreshToken);
  }

  @Get('auth/me')
  me(@CurrentUser() u: AuthUser) {
    return u;
  }

  @Post('auth/totp/setup')
  totpSetup(@CurrentUser() u: AuthUser) {
    return this.auth.totpSetup(u.sub);
  }

  @Post('auth/totp/enable')
  totpEnable(@CurrentUser() u: AuthUser, @Body() b: { code: string }) {
    return this.auth.totpEnable(u.sub, b.code);
  }

  // ---- App do cliente ----
  @Public()
  @Post('auth/client/request-code')
  requestCode(@Body() b: { officeCnpj: string; document: string; contact: string }) {
    return this.auth.requestClientCode(b.officeCnpj, b.document, b.contact);
  }

  @Public()
  @Post('auth/client/verify')
  verify(@Body() b: { officeCnpj: string; document: string; code: string }) {
    return this.auth.verifyClientCode(b.officeCnpj, b.document, b.code);
  }

  // ---- Usuários do escritório ----
  @Get('users')
  users() {
    return this.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, totpEnabled: true, departments: { include: { department: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post('users')
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  async createUser(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const d = UserSchema.parse(body);
    const passwordHash = await this.auth.hashPassword(d.password ?? cryptoPassword());
    return this.prisma.user.create({
      data: {
        tenantId: u.tenantId, name: d.name, email: d.email.toLowerCase(), role: d.role, passwordHash,
        departments: { create: d.departments },
      },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  @Put('users/:id')
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  async updateUser(@Param('id') id: string, @Body() body: unknown) {
    const d = UserSchema.partial().parse(body);
    if (d.departments) {
      await this.prisma.userDepartment.deleteMany({ where: { userId: id } });
      await this.prisma.userDepartment.createMany({ data: d.departments.map((x) => ({ ...x, userId: id })) });
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        name: d.name, email: d.email?.toLowerCase(), role: d.role, active: d.active,
        ...(d.password ? { passwordHash: await this.auth.hashPassword(d.password) } : {}),
      },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  }

  @Delete('users/:id')
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  deactivate(@Param('id') id: string) {
    return this.prisma.user.update({ where: { id }, data: { active: false }, select: { id: true, active: true } });
  }

  @Get('permissions')
  permissions() {
    return ROLE_PERMISSIONS;
  }
}

const cryptoPassword = () => require('node:crypto').randomBytes(12).toString('base64url');

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
