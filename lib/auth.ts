import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./db";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET || "cdm-demo-super-secret-nextauth-key-32chars",
  session: {
    strategy: "jwt",
  },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "demo-client-id",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "demo-client-secret",
          }),
        ]),
    CredentialsProvider({
      id: "credentials",
      name: "Demo Account",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "demo@trycdm.com" },
      },
      async authorize(credentials) {
        return {
          id: "user_demo_sales",
          name: "Demo Sales Rep",
          email: credentials?.email || "demo@trycdm.com",
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
        (session.user as any).id = token?.id || (token as any)?.sub || user?.id || "user_demo_sales";
        (session.user as any).roles = (token as any)?.roles || (user as any)?.roles || "sales";
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};
