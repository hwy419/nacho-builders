import { NextAuthOptions, getServerSession } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { prisma } from "./db"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
    EmailProvider({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM || "Nacho Builders <noreply@nacho.builders>",
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub

        // Fetch user data from database
        const user = await prisma.user.findUnique({
          where: { id: token.sub },
          select: {
            credits: true,
            role: true,
            status: true,
          }
        })

        if (user) {
          (session.user as any).credits = user.credits;
          (session.user as any).role = user.role;
          (session.user as any).status = user.status;
        }
      }
      return session
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.sub = user.id
      }

      // Update last login
      if (trigger === "signIn" && token.sub) {
        try {
          await prisma.user.update({
            where: { id: token.sub },
            data: { lastLoginAt: new Date() }
          })
        } catch (error) {
          console.error("[Auth] Failed to update last login:", error)
        }

        // Create default FREE API key if user doesn't have one
        try {
          const existingFreeKey = await prisma.apiKey.findFirst({
            where: { userId: token.sub, tier: "FREE" }
          })

          if (!existingFreeKey) {
            const { generateApiKey, hashApiKey } = await import("./utils")
            const key = generateApiKey()
            const keyHash = await hashApiKey(key)

            // Create the default FREE key with new generous limits
            await prisma.apiKey.create({
              data: {
                userId: token.sub,
                name: "Default API Key",
                keyHash,
                keyPrefix: key.slice(0, 12),
                tier: "FREE",
                isDefault: true,  // Mark as the default key (cannot be deleted)
                rateLimitPerSecond: 100,      // 100 req/sec
                dailyRequestLimit: 100000,    // 100k requests/day
                websocketLimit: 5,            // 5 concurrent connections
                dataRetentionDays: 30,        // 30 days
                submitRateLimitHour: 10,      // 10 tx/hour
                allowedApis: ["v1/ogmios", "v1/graphql", "v1/submit"],  // All APIs, submit is rate-limited
              }
            })
            console.log(`[Auth] Created default FREE API key for user ${token.sub}`)
          }
        } catch (error) {
          console.error("[Auth] Failed to create default API key:", error)
          // Don't throw - allow sign-in to proceed even if key creation fails
        }
      }

      return token
    },
  },
  events: {
    async signIn({ user, isNewUser }) {
      if (isNewUser) {
        console.log(`New user signed up: ${user.email}`)
      }
    },
  },
}

export const auth = () => getServerSession(authOptions)


