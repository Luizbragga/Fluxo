// prisma/seed.ts
import {
  PrismaClient,
  Role,
  Specialty,
  AppointmentState,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// --- helpers ---

async function ensureTenantWithLocation(opts: {
  tenantSlug: string;
  tenantName: string;
  tenantNif?: string | null;
  locationSlug: string;
  locationName: string;
  locationAddress?: string | null;
}) {
  const {
    tenantSlug,
    tenantName,
    tenantNif,
    locationSlug,
    locationName,
    locationAddress,
  } = opts;

  // 1) Tenant
  let tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug } });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        slug: tenantSlug,
        name: tenantName,
        nif: tenantNif ?? null,
      },
    });
  }

  // 2) Location (filial) desse tenant
  let location = await prisma.location.findFirst({
    where: { tenantId: tenant.id, slug: locationSlug },
  });

  if (!location) {
    location = await prisma.location.create({
      data: {
        tenantId: tenant.id,
        slug: locationSlug,
        name: locationName,
        address: locationAddress ?? null,
      },
    });
  }

  return { tenant, location };
}

async function createUserIfNotExists(opts: {
  tenantId: string;
  locationId?: string | null;
  role: Role;
  name: string;
  email: string;
  phone?: string | null;
  password: string;
}) {
  const { tenantId, locationId, role, name, email, phone, password } = opts;

  // email é globalmente único no schema atual
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) return existing;

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      tenantId,
      locationId: locationId ?? null,
      role,
      name,
      email,
      phone: phone ?? null,
      passwordHash,
      active: true,
    },
  });

  return user;
}

async function createProviderIfNotExists(opts: {
  tenantId: string;
  locationId: string;
  userId: string;
  name: string;
  specialty?: Specialty;
}) {
  const { tenantId, locationId, userId, name, specialty } = opts;

  const existing = await prisma.provider.findFirst({
    where: { tenantId, userId },
  });

  if (existing) return existing;

  const provider = await prisma.provider.create({
    data: {
      tenantId,
      locationId,
      userId,
      name,
      specialty: specialty ?? Specialty.other,
      active: true,
    },
  });

  return provider;
}

async function createServiceIfNotExists(opts: {
  tenantId: string;
  name: string;
  durationMin: number;
  priceCents: number;
}) {
  const { tenantId, name, durationMin, priceCents } = opts;

  const existing = await prisma.service.findFirst({
    where: { tenantId, name },
  });

  if (existing) return existing;

  const service = await prisma.service.create({
    data: {
      tenantId,
      name,
      durationMin,
      priceCents,
      active: true,
    },
  });

  return service;
}

async function createDemoAppointment(opts: {
  tenantId: string;
  locationId: string;
  providerId: string;
  serviceId: string;
  serviceName: string;
  serviceDurationMin: number;
  servicePriceCents: number;
  createdById: string;
}) {
  const {
    tenantId,
    locationId,
    providerId,
    serviceId,
    serviceName,
    serviceDurationMin,
    servicePriceCents,
    createdById,
  } = opts;

  const now = new Date();
  const startAt = new Date(now.getTime() + 60 * 60 * 1000); // +1h
  const endAt = new Date(startAt.getTime() + serviceDurationMin * 60 * 1000);

  await prisma.appointment.create({
    data: {
      tenantId,
      locationId,
      providerId,
      serviceId,
      serviceName,
      serviceDurationMin,
      servicePriceCents,
      startAt,
      endAt,
      clientName: 'Cliente Demo',
      clientPhone: '+351900000000',
      status: AppointmentState.scheduled,
      createdById,
    },
  });
}

// --- main ---

async function main() {
  // Tenant + filial demo
  const { tenant, location } = await ensureTenantWithLocation({
    tenantSlug: 'demo-barber',
    tenantName: 'Demo Barber',
    tenantNif: null,
    locationSlug: 'demo-centro',
    locationName: 'Demo Barber - Centro',
    locationAddress: 'Rua Demo 123, Centro',
  });

  // Senha demo (a mesma para todos os usuários de seed)
  const demoPassword = 'demo123';

  // Owner (sem locationId, enxerga todas as filiais do tenant)
  const ownerUser = await createUserIfNotExists({
    tenantId: tenant.id,
    locationId: null,
    role: Role.owner,
    name: 'Owner Demo',
    email: 'owner@demo.com',
    phone: '+351900000001',
    password: demoPassword,
  });

  // Provider user (ligado à filial Demo - Centro)
  const providerUser = await createUserIfNotExists({
    tenantId: tenant.id,
    locationId: location.id,
    role: Role.provider,
    name: 'Rafa Barber',
    email: 'provider@demo.com',
    phone: '+351900000002',
    password: demoPassword,
  });

  // Provider (1:1 com user provider)
  const provider = await createProviderIfNotExists({
    tenantId: tenant.id,
    locationId: location.id,
    userId: providerUser.id,
    name: providerUser.name,
    specialty: Specialty.barber,
  });

  // Alguns serviços demo
  const corte = await createServiceIfNotExists({
    tenantId: tenant.id,
    name: 'Corte masculino',
    durationMin: 30,
    priceCents: 1500,
  });

  const barba = await createServiceIfNotExists({
    tenantId: tenant.id,
    name: 'Barba',
    durationMin: 20,
    priceCents: 1000,
  });

  // Um agendamento demo só pra ter dado no painel
  await createDemoAppointment({
    tenantId: tenant.id,
    locationId: location.id,
    providerId: provider.id,
    serviceId: corte.id,
    serviceName: corte.name,
    serviceDurationMin: corte.durationMin,
    servicePriceCents: corte.priceCents,
    createdById: ownerUser.id,
  });

  console.log(
    '✅ Seed concluído com tenant + location + owner + provider + serviços + 1 appointment demo',
  );
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
