import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../server/password.ts";
import { readAdminSeedConfig } from "../server/seed-config.ts";

const prisma = new PrismaClient();

const roles = [
  ["SUPER_ADMIN", "Full platform administration."],
  ["ADMIN", "Administrative access."],
  ["MANAGER", "Division management."],
  ["EMPLOYEE", "Employee access."],
] as const;

async function main() {
  const { email: adminEmail, name: adminName, password } =
    readAdminSeedConfig(process.env);
  const passwordHash = await hashPassword(password);

  for (const [name, description] of roles) {
    await prisma.role.upsert({
      where: { name },
      create: { name, description },
      update: { description },
    });
  }

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: "SUPER_ADMIN" },
    select: { id: true },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: adminName,
      roleId: superAdminRole.id,
      passwordHash,
    },
    update: {
      name: adminName,
      roleId: superAdminRole.id,
      passwordHash,
    },
  });
  await prisma.session.deleteMany({ where: { userId: adminUser.id } });

  console.info(`Seeded ${roles.length} roles and the configured local administrator.`);
}

main()
  .catch((error: unknown) => {
    console.error("Prisma seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
