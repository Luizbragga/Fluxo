import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        role: true,
        name: true,
        email: true,
        createdAt: true,
        active: true,
        locationId: true,
        phone: true,
      },
    });
  }

  async listByTenant(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        locationId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInTenant(params: {
    tenantId: string;
    name: string;
    email: string;
    password: string;
    role: Role;
  }) {
    const passwordHash = await bcrypt.hash(params.password, 10);
    return this.prisma.user.create({
      data: {
        tenantId: params.tenantId,
        name: params.name,
        email: params.email,
        role: params.role,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        locationId: true,
      },
    });
  }

  async updateInTenant(tenantId: string, id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('User não encontrado neste tenant');
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        locationId: true,
      },
    });
  }
}
