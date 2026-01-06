import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Activity, Zap, Clock, CreditCard, Key, Shield, Crown, Info } from "lucide-react"
import Link from "next/link"

async function getDashboardStats(userId: string) {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [requestsToday, activeKeys, freeKeyCount, paidKeyCount, adminKeyCount, avgResponseTime] = await Promise.all([
    // Count requests made today by this user
    prisma.usageLog.count({
      where: {
        userId,
        timestamp: { gte: startOfDay },
      },
    }),
    // Count active API keys for this user
    prisma.apiKey.count({
      where: {
        userId,
        active: true,
      },
    }),
    // Count FREE tier keys
    prisma.apiKey.count({
      where: {
        userId,
        tier: "FREE",
      },
    }),
    // Count PAID tier keys
    prisma.apiKey.count({
      where: {
        userId,
        tier: "PAID",
      },
    }),
    // Count ADMIN tier keys (secret tier)
    prisma.apiKey.count({
      where: {
        userId,
        tier: "ADMIN",
      },
    }),
    // Calculate average response time for requests today
    prisma.usageLog.aggregate({
      where: {
        userId,
        timestamp: { gte: startOfDay },
      },
      _avg: { responseTime: true },
    }),
  ])

  return {
    requestsToday,
    activeKeys,
    freeKeyCount,
    paidKeyCount,
    adminKeyCount,
    avgResponseTime: avgResponseTime._avg.responseTime
      ? Math.round(avgResponseTime._avg.responseTime)
      : 0,
  }
}

export default async function DashboardOverview() {
  const session = await auth()
  const stats = await getDashboardStats(session!.user.id)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold mb-2">
          Welcome back, {session?.user?.name || "Developer"}
        </h1>
        <p className="text-text-secondary">
          Here's what's happening with your APIs today
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="card-hover">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-text-muted mb-1">Requests Today</div>
                <div className="text-3xl font-bold">{stats.requestsToday.toLocaleString()}</div>
              </div>
              <Activity className="w-8 h-8 text-accent" />
            </div>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-text-muted mb-1">Active API Keys</div>
                <div className="text-3xl font-bold">{stats.activeKeys}</div>
              </div>
              <Zap className="w-8 h-8 text-warning" />
            </div>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-text-muted mb-1">Avg Response</div>
                <div className="text-3xl font-bold">{stats.avgResponseTime > 0 ? `${stats.avgResponseTime}ms` : "—"}</div>
              </div>
              <Clock className="w-8 h-8 text-success" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Credit Balance */}
      <Card className="card-highlight">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Credit Balance
              </CardTitle>
              <CardDescription>Credits for your PAID API keys</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {stats.adminKeyCount > 0 && (
                <Badge variant="admin" className="flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  {stats.adminKeyCount} Admin
                </Badge>
              )}
              {stats.freeKeyCount > 0 && (
                <Badge variant="free" className="flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  {stats.freeKeyCount} Free
                </Badge>
              )}
              {stats.paidKeyCount > 0 && (
                <Badge variant="paid" className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {stats.paidKeyCount} Paid
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-5xl font-bold mb-2">{session?.user?.credits?.toLocaleString() || "0"}</div>
              <div className="text-text-secondary">
                {(session?.user?.credits || 0) > 0
                  ? `${(session?.user?.credits || 0).toLocaleString()} API requests for PAID keys`
                  : "Purchase credits to create PAID API keys"}
              </div>
            </div>
            <Link href="/billing">
              <Button>Buy Credits</Button>
            </Link>
          </div>

          {/* Info about credit usage */}
          <div className="mt-4 pt-4 border-t border-border-default">
            <div className="flex gap-3">
              <Info className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <p className="text-xs text-text-muted">
                Your <strong>FREE key never uses credits</strong> (100 req/s, 100k/day).
                Credits are only consumed by PAID keys at 1 credit per request.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="card-hover">
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>Manage your API access keys</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/api-keys">
              <Button variant="secondary" className="w-full">View API Keys</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardHeader>
            <CardTitle>Usage Analytics</CardTitle>
            <CardDescription>Monitor your API usage and performance</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/usage">
              <Button variant="secondary" className="w-full">View Usage</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

