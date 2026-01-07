"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings,
  LogOut,
  Shield,
  ArrowLeft
} from "lucide-react"

export function AdminSidebar() {
  const pathname = usePathname()

  const navItems = [
    { name: "Overview", href: "/admin", icon: LayoutDashboard },
    { name: "Users", href: "/admin/users", icon: Users },
    { name: "Payments", href: "/admin/payments", icon: CreditCard },
    { name: "System", href: "/admin/system", icon: Settings },
  ]

  return (
    <div className="sidebar w-64 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-accent" />
          <div className="text-2xl font-bold text-gradient">Admin</div>
        </div>
        <div className="text-xs text-text-muted mt-1">Nacho Platform</div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
                          (item.href !== "/admin" && pathname?.startsWith(item.href))
          const Icon = item.icon

          return (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "sidebar-item",
                isActive && "sidebar-item-active"
              )}>
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-4 space-y-4 border-t border-border">
        {/* Admin indicator */}
        <div className="p-4 bg-accent/10 border border-accent/20 rounded-lg">
          <div className="flex items-center gap-2 text-accent">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-medium">Admin Mode</span>
          </div>
        </div>

        {/* Back to Dashboard */}
        <Link href="/dashboard">
          <div className="sidebar-item">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Dashboard</span>
          </div>
        </Link>

        {/* Logout */}
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="sidebar-item w-full text-left text-error hover:bg-error/10"
        >
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  )
}
