import jwt from "jsonwebtoken";

export function generateAccessToken(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET as string, {
    expiresIn: "15m", // short lifetime
  });
}

export function generateRefreshToken(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: "7d", // long lifetime
  });
}
