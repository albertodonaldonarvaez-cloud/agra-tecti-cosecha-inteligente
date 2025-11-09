import { Request, Response } from "express";
import { getUserFromToken } from "../auth";
import type { User } from "../../drizzle/schema";

const COOKIE_NAME = "auth_token";

export interface AuthContext {
  req: Request;
  res: Response;
  user: User | null;
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<AuthContext> {
  // Obtener token de la cookie
  const token = req.cookies[COOKIE_NAME];
  
  let user: User | null = null;
  
  if (token) {
    user = await getUserFromToken(token);
  }
  
  return {
    req,
    res,
    user,
  };
}

export { COOKIE_NAME };
