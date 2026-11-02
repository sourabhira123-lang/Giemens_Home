import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const roles = [
  ["SuperAdmin", "Full platform administration."],
  ["Admin", "CRM administration."],
  ["CEO", "Executive read access."],
  ["Manager", "Division lead management."],
  ["Employee", "Assigned lead and activity access."],
  ["Customer", "Customer portal access when enabled."],
] as const;

async function main() {
  for (const [name, description] of roles) {
    await prisma.role.upsert({
      where: { name },
      create: { name, description },
      update: { description },
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error("Prisma seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
