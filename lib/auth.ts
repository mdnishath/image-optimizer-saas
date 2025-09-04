import { prisma } from "@/lib/prisma";
import jwt, { JwtPayload } from "jsonwebtoken";

export async function getUserFromRequest(req: Request) {
  // 1. API Key (for WordPress plugin / Freemius license)
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    const user = await prisma.user.findUnique({ where: { apiKey } });
    if (user) return user;
  }

  // 2. Bearer Token (for Dashboard session)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as JwtPayload & { userId?: string };

      if (payload?.userId) {
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
        });
        if (user) return user;
      }
    } catch (err) {
      console.error("JWT verification failed:", err);
      return null;
    }
  }

  return null;
}
