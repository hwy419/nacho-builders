"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/utils"
import {
  Settings,
  Package,
  Plus,
  Trash2,
  Save,
  Star,
  Edit2,
  X,
  Check
} from "lucide-react"

export default function AdminSystemPage() {
  const [editingConfig, setEditingConfig] = useState<string | null>(null)
  const [editingConfigValue, setEditingConfigValue] = useState("")
  const [newConfigKey, setNewConfigKey] = useState("")
  const [newConfigValue, setNewConfigValue] = useState("")
  const [newConfigDesc, setNewConfigDesc] = useState("")
  const [showNewConfig, setShowNewConfig] = useState(false)

  const [editingPackage, setEditingPackage] = useState<string | null>(null)
  const [packageForm, setPackageForm] = useState({
    name: "",
    credits: 0,
    adaPrice: 0,
    bonusPercent: 0,
    displayOrder: 0,
    popular: false,
    active: true,
  })
  const [showNewPackage, setShowNewPackage] = useState(false)

  const utils = trpc.useUtils()

  const { data: systemConfigs, isLoading: configsLoading } = trpc.admin.listSystemConfig.useQuery()
  const { data: creditPackages, isLoading: packagesLoading } = trpc.admin.listCreditPackages.useQuery()

  const updateConfig = trpc.admin.updateSystemConfig.useMutation({
    onSuccess: () => {
      utils.admin.listSystemConfig.invalidate()
      setEditingConfig(null)
      setEditingConfigValue("")
    },
  })

  const updatePackage = trpc.admin.updateCreditPackage.useMutation({
    onSuccess: () => {
      utils.admin.listCreditPackages.invalidate()
      setEditingPackage(null)
      resetPackageForm()
    },
  })

  const createPackage = trpc.admin.createCreditPackage.useMutation({
    onSuccess: () => {
      utils.admin.listCreditPackages.invalidate()
      setShowNewPackage(false)
      resetPackageForm()
    },
  })

  const deletePackage = trpc.admin.deleteCreditPackage.useMutation({
    onSuccess: () => {
      utils.admin.listCreditPackages.invalidate()
    },
  })

  const resetPackageForm = () => {
    setPackageForm({
      name: "",
      credits: 0,
      adaPrice: 0,
      bonusPercent: 0,
      displayOrder: 0,
      popular: false,
      active: true,
    })
  }

  const startEditPackage = (pkg: NonNullable<typeof creditPackages>[0]) => {
    setEditingPackage(pkg.id)
    setPackageForm({
      name: pkg.name,
      credits: pkg.credits,
      adaPrice: Number(pkg.adaPrice),
      bonusPercent: pkg.bonusPercent,
      displayOrder: pkg.displayOrder,
      popular: pkg.popular,
      active: pkg.active,
    })
  }

  const handleSaveConfig = (key: string) => {
    updateConfig.mutate({ key, value: editingConfigValue })
  }

  const handleCreateConfig = () => {
    if (newConfigKey && newConfigValue) {
      updateConfig.mutate({
        key: newConfigKey,
        value: newConfigValue,
        description: newConfigDesc || undefined,
      })
      setShowNewConfig(false)
      setNewConfigKey("")
      setNewConfigValue("")
      setNewConfigDesc("")
    }
  }

  const handleSavePackage = () => {
    if (editingPackage) {
      updatePackage.mutate({
        id: editingPackage,
        ...packageForm,
      })
    }
  }

  const handleCreatePackage = () => {
    if (packageForm.name && packageForm.credits > 0 && packageForm.adaPrice > 0) {
      createPackage.mutate(packageForm)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary">System Configuration</h1>
        <p className="text-text-secondary mt-1">Manage platform settings and credit packages</p>
      </div>

      {/* Credit Packages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Credit Packages
            </CardTitle>
            <CardDescription>Configure available credit packages for purchase</CardDescription>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setShowNewPackage(true)
              resetPackageForm()
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Package
          </Button>
        </CardHeader>
        <CardContent>
          {packagesLoading ? (
            <div className="text-text-secondary text-center py-8">Loading...</div>
          ) : !creditPackages?.length ? (
            <div className="text-text-secondary text-center py-8">No credit packages configured</div>
          ) : (
            <div className="space-y-4">
              {creditPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`p-4 rounded-lg border ${
                    pkg.active ? "border-border bg-bg-secondary" : "border-border/50 bg-bg-tertiary/50"
                  }`}
                >
                  {editingPackage === pkg.id ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs text-text-muted mb-1">Name</label>
                          <Input
                            value={packageForm.name}
                            onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-text-muted mb-1">Credits</label>
                          <Input
                            type="number"
                            value={packageForm.credits}
                            onChange={(e) => setPackageForm({ ...packageForm, credits: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-text-muted mb-1">ADA Price</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={packageForm.adaPrice}
                            onChange={(e) => setPackageForm({ ...packageForm, adaPrice: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-text-muted mb-1">Bonus %</label>
                          <Input
                            type="number"
                            value={packageForm.bonusPercent}
                            onChange={(e) => setPackageForm({ ...packageForm, bonusPercent: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={packageForm.popular}
                            onChange={(e) => setPackageForm({ ...packageForm, popular: e.target.checked })}
                            className="rounded border-border"
                          />
                          <span className="text-text-secondary">Popular</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={packageForm.active}
                            onChange={(e) => setPackageForm({ ...packageForm, active: e.target.checked })}
                            className="rounded border-border"
                          />
                          <span className="text-text-secondary">Active</span>
                        </label>
                        <div className="flex-1" />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingPackage(null)
                            resetPackageForm()
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSavePackage}
                          disabled={updatePackage.isPending}
                        >
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary">{pkg.name}</span>
                            {pkg.popular && (
                              <Star className="w-4 h-4 text-warning fill-warning" />
                            )}
                            {!pkg.active && (
                              <Badge variant="error">Inactive</Badge>
                            )}
                          </div>
                          <p className="text-sm text-text-muted mt-1">
                            {pkg.credits.toLocaleString()} credits for {Number(pkg.adaPrice)} ADA
                            {pkg.bonusPercent > 0 && ` (+${pkg.bonusPercent}% bonus)`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditPackage(pkg)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this package?")) {
                              deletePackage.mutate({ id: pkg.id })
                            }
                          }}
                          disabled={deletePackage.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-error" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* New Package Form */}
              {showNewPackage && (
                <div className="p-4 rounded-lg border border-accent/50 bg-accent/5">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Name</label>
                        <Input
                          placeholder="e.g., Starter"
                          value={packageForm.name}
                          onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Credits</label>
                        <Input
                          type="number"
                          placeholder="10000"
                          value={packageForm.credits || ""}
                          onChange={(e) => setPackageForm({ ...packageForm, credits: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1">ADA Price</label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="5.00"
                          value={packageForm.adaPrice || ""}
                          onChange={(e) => setPackageForm({ ...packageForm, adaPrice: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Bonus %</label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={packageForm.bonusPercent || ""}
                          onChange={(e) => setPackageForm({ ...packageForm, bonusPercent: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={packageForm.popular}
                          onChange={(e) => setPackageForm({ ...packageForm, popular: e.target.checked })}
                          className="rounded border-border"
                        />
                        <span className="text-text-secondary">Popular</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={packageForm.active}
                          onChange={(e) => setPackageForm({ ...packageForm, active: e.target.checked })}
                          className="rounded border-border"
                        />
                        <span className="text-text-secondary">Active</span>
                      </label>
                      <div className="flex-1" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowNewPackage(false)
                          resetPackageForm()
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleCreatePackage}
                        disabled={createPackage.isPending || !packageForm.name || !packageForm.credits || !packageForm.adaPrice}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Create
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Configuration */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              System Settings
            </CardTitle>
            <CardDescription>Configure platform-wide settings and feature flags</CardDescription>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowNewConfig(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Setting
          </Button>
        </CardHeader>
        <CardContent>
          {configsLoading ? (
            <div className="text-text-secondary text-center py-8">Loading...</div>
          ) : !systemConfigs?.length && !showNewConfig ? (
            <div className="text-text-secondary text-center py-8">
              No system configuration found.
              <button
                onClick={() => setShowNewConfig(true)}
                className="text-accent hover:text-accent-hover ml-1"
              >
                Add one
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {systemConfigs?.map((config) => (
                <div
                  key={config.id}
                  className="p-4 rounded-lg border border-border bg-bg-secondary"
                >
                  {editingConfig === config.key ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Key</label>
                        <p className="font-mono text-sm text-text-primary">{config.key}</p>
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1">Value</label>
                        <Input
                          value={editingConfigValue}
                          onChange={(e) => setEditingConfigValue(e.target.value)}
                          className="font-mono"
                        />
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingConfig(null)
                            setEditingConfigValue("")
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveConfig(config.key)}
                          disabled={updateConfig.isPending}
                        >
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-mono text-sm font-medium text-text-primary">{config.key}</p>
                        {config.description && (
                          <p className="text-xs text-text-muted mt-1">{config.description}</p>
                        )}
                        <p className="font-mono text-sm text-text-secondary mt-2 bg-bg-tertiary p-2 rounded">
                          {config.value}
                        </p>
                        <p className="text-xs text-text-muted mt-2">
                          Updated: {formatDate(config.updatedAt)}
                          {config.updatedBy && ` by ${config.updatedBy}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingConfig(config.key)
                          setEditingConfigValue(config.value)
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {/* New Config Form */}
              {showNewConfig && (
                <div className="p-4 rounded-lg border border-accent/50 bg-accent/5">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Key</label>
                      <Input
                        placeholder="e.g., feature.new_dashboard"
                        value={newConfigKey}
                        onChange={(e) => setNewConfigKey(e.target.value)}
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Value</label>
                      <Input
                        placeholder="e.g., true"
                        value={newConfigValue}
                        onChange={(e) => setNewConfigValue(e.target.value)}
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Description (optional)</label>
                      <Input
                        placeholder="e.g., Enable new dashboard feature"
                        value={newConfigDesc}
                        onChange={(e) => setNewConfigDesc(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowNewConfig(false)
                          setNewConfigKey("")
                          setNewConfigValue("")
                          setNewConfigDesc("")
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleCreateConfig}
                        disabled={updateConfig.isPending || !newConfigKey || !newConfigValue}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Create
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tier Limits Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Tier Limits Reference
          </CardTitle>
          <CardDescription>Default limits for API tiers (configured in API keys)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-lg border border-border bg-bg-secondary">
              <Badge variant="free" className="mb-3">FREE Tier</Badge>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li className="flex justify-between">
                  <span>Rate Limit</span>
                  <span className="text-text-primary">10 req/sec</span>
                </li>
                <li className="flex justify-between">
                  <span>WebSocket Connections</span>
                  <span className="text-text-primary">2</span>
                </li>
                <li className="flex justify-between">
                  <span>Data Retention</span>
                  <span className="text-text-primary">7 days</span>
                </li>
              </ul>
            </div>
            <div className="p-4 rounded-lg border border-accent/20 bg-accent/5">
              <Badge variant="paid" className="mb-3">PAID Tier</Badge>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li className="flex justify-between">
                  <span>Rate Limit</span>
                  <span className="text-text-primary">100 req/sec</span>
                </li>
                <li className="flex justify-between">
                  <span>WebSocket Connections</span>
                  <span className="text-text-primary">25</span>
                </li>
                <li className="flex justify-between">
                  <span>Data Retention</span>
                  <span className="text-text-primary">90 days</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
