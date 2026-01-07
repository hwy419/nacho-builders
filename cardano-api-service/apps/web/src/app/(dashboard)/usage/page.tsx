import { auth } from "@/lib/auth"

import { prisma } from "@/lib/db"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils"

export default async function UsagePage() {
  const session = await auth()
  
  // Fetch recent usage logs
  const recentUsage = await prisma.usageLog.findMany({
    where: { userId: session!.user.id },
    orderBy: { timestamp: 'desc' },
    take: 50,
    include: {
      apiKey: {
        select: { name: true, keyPrefix: true }
      }
    }
  })

  // Calculate stats
  const totalRequests = recentUsage.length
  const totalCreditsUsed = recentUsage.reduce((sum, log) => sum + log.creditsUsed, 0)
  const avgResponseTime = recentUsage.length > 0 
    ? Math.round(recentUsage.reduce((sum, log) => sum + log.responseTime, 0) / recentUsage.length)
    : 0

  // Group by endpoint
  const byEndpoint = recentUsage.reduce((acc, log) => {
    acc[log.endpoint] = (acc[log.endpoint] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Group by network
  const byNetwork = recentUsage.reduce((acc, log) => {
    const network = log.network || 'mainnet'
    acc[network] = (acc[network] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold mb-2">Usage Analytics</h1>
        <p className="text-text-secondary">
          Track your API usage and performance metrics
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="card-hover">
          <CardContent className="p-6">
            <div className="text-sm text-text-muted mb-1">Total Requests</div>
            <div className="text-4xl font-bold">{totalRequests}</div>
            <div className="text-text-secondary text-sm mt-1">Last 24 hours</div>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardContent className="p-6">
            <div className="text-sm text-text-muted mb-1">Credits Used</div>
            <div className="text-4xl font-bold">{totalCreditsUsed}</div>
            <div className="text-text-secondary text-sm mt-1">Last 24 hours</div>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardContent className="p-6">
            <div className="text-sm text-text-muted mb-1">Avg Response</div>
            <div className="text-4xl font-bold">{avgResponseTime}ms</div>
            <div className="text-text-secondary text-sm mt-1">Last 24 hours</div>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardContent className="p-6">
            <div className="text-sm text-text-muted mb-1">By Network</div>
            <div className="space-y-2 mt-2">
              {Object.entries(byNetwork).map(([network, count]) => (
                <div key={network} className="flex items-center justify-between">
                  <Badge variant={network === 'mainnet' ? 'default' : 'secondary'}>
                    {network}
                  </Badge>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Requests by Endpoint */}
      <Card>
        <CardHeader>
          <CardTitle>Requests by Endpoint</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(byEndpoint).map(([endpoint, count]) => (
              <div key={endpoint} className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg">
                <div className="flex items-center gap-3">
                  <code className="text-sm font-mono">{endpoint}</code>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-text-primary font-semibold">{count} requests</span>
                  <div className="w-24 h-2 bg-bg-primary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-accent" 
                      style={{ width: `${(count / totalRequests) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Requests</CardTitle>
          <CardDescription>Last 50 API calls</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr className="text-left">
                  <th className="p-4 text-text-muted font-medium text-sm">Time</th>
                  <th className="p-4 text-text-muted font-medium text-sm">Network</th>
                  <th className="p-4 text-text-muted font-medium text-sm">Endpoint</th>
                  <th className="p-4 text-text-muted font-medium text-sm">API Key</th>
                  <th className="p-4 text-text-muted font-medium text-sm">Status</th>
                  <th className="p-4 text-text-muted font-medium text-sm">Response Time</th>
                  <th className="p-4 text-text-muted font-medium text-sm">Credits</th>
                </tr>
              </thead>
              <tbody>
                {recentUsage.map((log) => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-bg-tertiary/50">
                    <td className="p-4 text-sm text-text-secondary">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="p-4">
                      <Badge variant={(log.network || 'mainnet') === 'mainnet' ? 'default' : 'secondary'}>
                        {log.network || 'mainnet'}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <code className="text-sm text-text-primary">{log.endpoint}</code>
                    </td>
                    <td className="p-4 text-sm text-text-secondary">
                      {log.apiKey.keyPrefix}...
                    </td>
                    <td className="p-4">
                      <Badge variant={
                        log.statusCode < 300 ? "success" :
                        log.statusCode < 400 ? "info" :
                        log.statusCode < 500 ? "warning" :
                        "error"
                      }>
                        {log.statusCode}
                      </Badge>
                    </td>
                    <td className="p-4 text-sm">
                      <span className={
                        log.responseTime < 100 ? "text-success" :
                        log.responseTime < 500 ? "text-warning" :
                        "text-error"
                      }>
                        {log.responseTime}ms
                      </span>
                    </td>
                    <td className="p-4 text-sm text-text-muted">{log.creditsUsed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}





