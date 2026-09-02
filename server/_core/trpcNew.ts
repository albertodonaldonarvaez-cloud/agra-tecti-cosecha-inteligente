import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { AuthContext } from "./authContext";

const t = initTRPC.context<AuthContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

// Permite llamar a los procedimientos desde el propio servidor, sin pasar por
// HTTP ni por superjson. Lo usa la fachada REST /api/v1: así los endpoints para
// agentes reutilizan la misma lógica que la web, en vez de duplicarla.
export const createCallerFactory = t.createCallerFactory;
