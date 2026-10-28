import crypto from "node:crypto";
import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./db";

function safeMatch(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
const hasGoogleSso = Boolean(googleClientId && googleClientSecret);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET || "cdm-demo-super-secret-nextauth-key-32chars",
  session: {
    strategy: "jwt",
  },
  providers: [
    ...(hasGoogleSso
      ? [
          GoogleProvider({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          }),
        ]
      : []),
    CredentialsProvider({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@company.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const inputEmail = String(credentials?.email || "").trim().toLowerCase();
        const inputPassword = String(credentials?.password || "");

        if (!inputEmail || !inputEmail.includes("@")) {
          return null;
        }

        const configuredEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
        const configuredPassword = process.env.ADMIN_PASSWORD || "";

        if (configuredPassword) {
          const emailOk = configuredEmail ? safeMatch(inputEmail, configuredEmail) : true;
          const passOk = safeMatch(inputPassword, configuredPassword);
          if (!emailOk || !passOk) {
            return null;
          }
        } else if (!inputPassword) {
          return null;
        }

        const displayName = inputEmail.split("@")[0] || "Admin";
        let userId = `user_${crypto.createHash("sha1").update(inputEmail).digest("hex").slice(0, 16)}`;

        try {
          const dbUser = await prisma.user.upsert({
            where: { email: inputEmail },
            update: { name: displayName },
            create: {
              email: inputEmail,
              name: displayName,
              roles: "sales",
            },
          });
          userId = dbUser.id;
        } catch {
          // Allow JWT session in preview environments where PostgreSQL is not attached
        }

        return {
          id: userId,
          name: displayName,
          email: inputEmail,
          roles: "sales",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        (token as any).roles = (user as any).roles || "sales";
      }
      return token;
    },
    async session({ session, token, user }) {
      if (session.user) {
        (session.user as any).id = token?.id || (token as any)?.sub || user?.id || "user_admin";
        (session.user as any).roles = (token as any)?.roles || (user as any)?.roles || "sales";
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};
