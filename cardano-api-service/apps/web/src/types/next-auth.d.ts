import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      credits: number
      role: "USER" | "ADMIN"
      status: "ACTIVE" | "SUSPENDED" | "DELETED"
    } & DefaultSession["user"]
  }
}






