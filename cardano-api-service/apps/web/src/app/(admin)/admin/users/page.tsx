"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/utils"
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  UserX,
  UserCheck,
  Shield,
  ShieldOff,
  CreditCard,
  X
} from "lucide-react"

type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED"
type UserRole = "USER" | "ADMIN"

export default function AdminUsersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [statusFilter, setStatusFilter] = useState<UserStatus | undefined>()
  const [roleFilter, setRoleFilter] = useState<UserRole | undefined>()
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [creditsDelta, setCreditsDelta] = useState("")

  const utils = trpc.useUtils()

  const { data: usersData, isLoading } = trpc.admin.listUsers.useQuery({
    page,
    limit: 20,
    search: search || undefined,
    status: statusFilter,
    role: roleFilter,
  })

  const { data: selectedUser, isLoading: userLoading } = trpc.admin.getUser.useQuery(
    { userId: selectedUserId! },
    { enabled: !!selectedUserId }
  )

  const updateUser = trpc.admin.updateUser.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate()
      utils.admin.getUser.invalidate({ userId: selectedUserId! })
    },
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const handleStatusChange = (userId: string, newStatus: UserStatus) => {
    updateUser.mutate({ userId, status: newStatus })
  }

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    updateUser.mutate({ userId, role: newRole })
  }

  const handleCreditsAdjust = (userId: string) => {
    const delta = parseInt(creditsDelta)
    if (!isNaN(delta)) {
      updateUser.mutate({ userId, creditsDelta: delta })
      setCreditsDelta("")
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary">User Management</h1>
        <p className="text-text-secondary mt-1">View and manage platform users</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Users List */}
        <div className="lg:col-span-2 space-y-6">
          {/* Search and Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4">
                <form onSubmit={handleSearch} className="flex-1 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <Input
                      placeholder="Search by email or name..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button type="submit" variant="secondary">Search</Button>
                </form>

                <div className="flex gap-2">
                  <select
                    value={statusFilter || ""}
                    onChange={(e) => {
                      setStatusFilter(e.target.value as UserStatus || undefined)
                      setPage(1)
                    }}
                    className="input"
                  >
                    <option value="">All Status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="DELETED">Deleted</option>
                  </select>

                  <select
                    value={roleFilter || ""}
                    onChange={(e) => {
                      setRoleFilter(e.target.value as UserRole || undefined)
                      setPage(1)
                    }}
                    className="input"
                  >
                    <option value="">All Roles</option>
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Users Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Users ({usersData?.total ?? 0})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-text-secondary text-center py-8">Loading...</div>
              ) : !usersData?.users.length ? (
                <div className="text-text-secondary text-center py-8">No users found</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">User</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Credits</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Role</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Status</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Joined</th>
                          <th className="text-right py-3 px-4 text-sm font-medium text-text-secondary">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersData.users.map((user) => (
                          <tr
                            key={user.id}
                            className={`border-b border-border/50 hover:bg-bg-tertiary cursor-pointer ${
                              selectedUserId === user.id ? "bg-bg-tertiary" : ""
                            }`}
                            onClick={() => setSelectedUserId(user.id)}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                {user.image ? (
                                  <img
                                    src={user.image}
                                    alt={user.name || "User"}
                                    className="w-8 h-8 rounded-full"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center">
                                    <Users className="w-4 h-4 text-text-muted" />
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium text-text-primary">
                                    {user.name || "—"}
                                  </p>
                                  <p className="text-xs text-text-muted">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-sm text-text-primary">
                                {user.credits.toLocaleString()}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant={user.role === "ADMIN" ? "paid" : "free"}>
                                {user.role}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant={
                                  user.status === "ACTIVE"
                                    ? "success"
                                    : user.status === "SUSPENDED"
                                    ? "warning"
                                    : "error"
                                }
                              >
                                {user.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-sm text-text-muted">
                                {formatDate(user.createdAt)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedUserId(user.id)
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {usersData.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-text-muted">
                        Page {page} of {usersData.totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={page <= 1}
                          onClick={() => setPage(page - 1)}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={page >= usersData.totalPages}
                          onClick={() => setPage(page + 1)}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* User Details Panel */}
        <div className="space-y-6">
          {selectedUserId ? (
            userLoading ? (
              <Card>
                <CardContent className="py-8 text-center text-text-secondary">
                  Loading user details...
                </CardContent>
              </Card>
            ) : selectedUser ? (
              <>
                {/* User Info */}
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between">
                    <CardTitle>User Details</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedUserId(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      {selectedUser.image ? (
                        <img
                          src={selectedUser.image}
                          alt={selectedUser.name || "User"}
                          className="w-12 h-12 rounded-full"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-bg-tertiary flex items-center justify-center">
                          <Users className="w-6 h-6 text-text-muted" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-text-primary">
                          {selectedUser.name || "—"}
                        </p>
                        <p className="text-sm text-text-muted">{selectedUser.email}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-text-muted">Credits</p>
                        <p className="font-medium text-text-primary">
                          {selectedUser.credits.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted">API Keys</p>
                        <p className="font-medium text-text-primary">
                          {selectedUser.apiKeys.length}
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted">Payments</p>
                        <p className="font-medium text-text-primary">
                          {selectedUser.payments.length}
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted">API Calls</p>
                        <p className="font-medium text-text-primary">
                          {selectedUser._count.usageLogs.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-text-muted text-sm mb-1">Joined</p>
                      <p className="text-sm text-text-primary">
                        {formatDate(selectedUser.createdAt)}
                      </p>
                    </div>

                    {selectedUser.lastLoginAt && (
                      <div>
                        <p className="text-text-muted text-sm mb-1">Last Login</p>
                        <p className="text-sm text-text-primary">
                          {formatDate(selectedUser.lastLoginAt)}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle>Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Adjust Credits */}
                    <div>
                      <p className="text-sm text-text-secondary mb-2">Adjust Credits</p>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="+100 or -50"
                          value={creditsDelta}
                          onChange={(e) => setCreditsDelta(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCreditsAdjust(selectedUser.id)}
                          disabled={updateUser.isPending || !creditsDelta}
                        >
                          <CreditCard className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Status Actions */}
                    <div>
                      <p className="text-sm text-text-secondary mb-2">Status</p>
                      <div className="flex gap-2">
                        {selectedUser.status !== "ACTIVE" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleStatusChange(selectedUser.id, "ACTIVE")}
                            disabled={updateUser.isPending}
                          >
                            <UserCheck className="w-4 h-4 mr-1" />
                            Activate
                          </Button>
                        )}
                        {selectedUser.status !== "SUSPENDED" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleStatusChange(selectedUser.id, "SUSPENDED")}
                            disabled={updateUser.isPending}
                          >
                            <UserX className="w-4 h-4 mr-1" />
                            Suspend
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Role Actions */}
                    <div>
                      <p className="text-sm text-text-secondary mb-2">Role</p>
                      <div className="flex gap-2">
                        {selectedUser.role !== "ADMIN" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRoleChange(selectedUser.id, "ADMIN")}
                            disabled={updateUser.isPending}
                          >
                            <Shield className="w-4 h-4 mr-1" />
                            Make Admin
                          </Button>
                        )}
                        {selectedUser.role !== "USER" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRoleChange(selectedUser.id, "USER")}
                            disabled={updateUser.isPending}
                          >
                            <ShieldOff className="w-4 h-4 mr-1" />
                            Remove Admin
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* API Keys */}
                {selectedUser.apiKeys.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>API Keys</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {selectedUser.apiKeys.map((key) => (
                          <div
                            key={key.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <div>
                              <p className="text-text-primary">{key.name}</p>
                              <p className="text-xs text-text-muted font-mono">
                                {key.keyPrefix}...
                              </p>
                            </div>
                            <div className="text-right">
                              <Badge variant={key.tier === "PAID" ? "paid" : "free"}>
                                {key.tier}
                              </Badge>
                              <p className="text-xs text-text-muted mt-1">
                                {key.active ? "Active" : "Inactive"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <p className="text-text-secondary">Select a user to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
