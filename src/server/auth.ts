import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { writeAuditLog } from "@/server/audit";
import { db } from "@/server/db";
import { accounts, sessions, users, verifications } from "@/server/schema/auth";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "mysql",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          await writeAuditLog({
            userId: session.userId,
            action: "auth.login",
            targetType: "session",
            targetId: session.id,
            ipAddress: session.ipAddress ?? null,
            userAgent: session.userAgent ?? null,
          });
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          await writeAuditLog({
            userId: user.id,
            action: "auth.user.created",
            targetType: "user",
            targetId: user.id,
          });
        },
      },
    },
  },
});
