import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../server/password.ts";

const prisma = new PrismaClient();

const roles = [
  ["SUPER_ADMIN", "Full platform administration."],
  ["ADMIN", "Administrative access."],
  ["MANAGER", "Division management."],
  ["EMPLOYEE", "Employee access."],
] as const;

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@giemens.local")
    .trim()
    .toLowerCase();
  const adminName = (process.env.ADMIN_NAME ?? "GIEMENS Local Admin").trim();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";

  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(adminEmail)) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }
  if (!adminName || adminName.length > 120) {
    throw new Error("ADMIN_NAME must be between 1 and 120 characters.");
  }
  if (adminPassword.length < 12 || Buffer.byteLength(adminPassword, "utf8") > 128) {
    throw new Error("Set ADMIN_PASSWORD to a unique password between 12 and 128 UTF-8 bytes.");
  }
  const passwordHash = await hashPassword(adminPassword);

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
