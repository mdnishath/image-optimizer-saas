import { PrismaClient } from "@/lib/generated/prisma";

const prisma = new PrismaClient();

export default prisma;

// const globalForPrisma = global as unknown as { prisma: PrismaClient };

// export const prisma =
//   globalForPrisma.prisma ||
//   new PrismaClient({
//     datasources: {
//       db: {
//         url: process.env.DATABASE_URL as string, // Works in local + production
//       },
//     },
//     log: ["error", "warn"], // Add "query" for debugging
//   });

// if (process.env.NODE_ENV !== "production") {
//   globalForPrisma.prisma = prisma;
// }
