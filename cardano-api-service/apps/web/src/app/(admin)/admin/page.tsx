"use client"

import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatADA, formatDate } from "@/lib/utils"
import { Users, CreditCard, Activity, Key, Clock, DollarSign } from "lucide-react"
import Link from "next/link"

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = trpc.admin.stats.useQuery()
  const { data: recentSignups, isLoading: signupsLoading } = trpc.admin.recentSignups.useQuery({ limit: 5 })
  const { data: recentPayments, isLoading: paymentsLoading } = trpc.admin.recentPayments.useQuery({ limit: 5 })

  const statCards = [
    {
      title: "Total Users",
      value: stats?.totalUsers ?? 0,
      icon: Users,
      color: "text-info",
    },
    {
      title: "Total Revenue",
      value: stats ? `${formatADA(stats.totalRevenue)} ADA` : "0 ADA",
      icon: DollarSign,
      color: "text-success",
    },
    {
      title: "API Calls Today",
      value: stats?.apiCallsToday ?? 0,
      icon: Activity,
      color: "text-accent",
    },
    {
      title: "Active Keys",
      value: stats?.activeKeys ?? 0,
      icon: Key,
      color: "text-warning",
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Admin Dashboard</h1>
        <p className="text-text-secondary mt-1">Platform overview and management</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text-secondary">{stat.title}</p>
                    <p className="text-2xl font-bold text-text-primary mt-1">
                      {statsLoading ? "..." : typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg bg-bg-tertiary ${stat.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <Clock className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Pending Payments</p>
                <p className="text-xl font-bold text-text-primary">
                  {statsLoading ? "..." : stats?.pendingPayments ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-info/10">
                <Activity className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Total API Calls</p>
                <p className="text-xl font-bold text-text-primary">
                  {statsLoading ? "..." : (stats?.totalApiCalls ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <DollarSign className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Avg Revenue/User</p>
                <p className="text-xl font-bold text-text-primary">
                  {statsLoading || !stats?.totalUsers
                    ? "..."
                    : stats.totalUsers > 0
                    ? `${formatADA(stats.totalRevenue / BigInt(stats.totalUsers))} ADA`
                    : "0 ADA"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Signups */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Signups</CardTitle>
            <Link href="/admin/users" className="text-sm text-accent hover:text-accent-hover">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {signupsLoading ? (
              <div className="text-text-secondary">Loading...</div>
            ) : !recentSignups?.length ? (
              <div className="text-text-secondary">No recent signups</div>
            ) : (
              <div className="space-y-4">
                {recentSignups.map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {user.image ? (
                        <img
                          src={user.image}
                          alt={user.name || "User"}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center">
                          <Users className="w-4 h-4 text-text-muted" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {user.name || user.email}
                        </p>
                        <p className="text-xs text-text-muted">{user.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={user.role === "ADMIN" ? "paid" : "free"}>
                        {user.role}
                      </Badge>
                      <p className="text-xs text-text-muted mt-1">
                        {formatDate(user.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Payments</CardTitle>
            <Link href="/admin/payments" className="text-sm text-accent hover:text-accent-hover">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {paymentsLoading ? (
              <div className="text-text-secondary">Loading...</div>
            ) : !recentPayments?.length ? (
              <div className="text-text-secondary">No recent payments</div>
            ) : (
              <div className="space-y-4">
                {recentPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {payment.user.name || payment.user.email}
                      </p>
                      <p className="text-xs text-text-muted">
                        {payment.packageName || `${payment.credits.toLocaleString()} credits`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-text-primary">
                        {formatADA(payment.amount)} ADA
                      </p>
                      <Badge
                        variant={
                          payment.status === "CONFIRMED"
                            ? "success"
                            : payment.status === "PENDING"
                            ? "warning"
                            : payment.status === "FAILED" || payment.status === "EXPIRED"
                            ? "error"
                            : "info"
                        }
                      >
                        {payment.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
