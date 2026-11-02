import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const roles = [
  ["SUPER_ADMIN", "Full platform administration."],
  ["ADMIN", "Administrative access."],
  ["MANAGER", "Division management."],
  ["EMPLOYEE", "Employee access."],
] as const;

async function main() {
  for (const [name, description] of roles) {
    await prisma.role.upsert({
      where: { name },
      create: { name, description },
      update: { description },
    });
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@giemens.local")
    .trim()
    .toLowerCase();
  const adminName = (process.env.ADMIN_NAME ?? "GIEMENS Local Admin").trim();

  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(adminEmail)) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }
  if (!adminName || adminName.length > 120) {
    throw new Error("ADMIN_NAME must be between 1 and 120 characters.");
  }

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: "SUPER_ADMIN" },
    select: { id: true },
  });

  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: adminName,
      roleId: superAdminRole.id,
      passwordHash: null,
    },
    update: {
      name: adminName,
      roleId: superAdminRole.id,
    },
  });

  console.info(`Seeded ${roles.length} roles and the local admin account ${adminEmail}.`);
}

main()
  .catch((error: unknown) => {
    console.error("Prisma seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
