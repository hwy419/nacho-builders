"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Key,
  BarChart3,
  CreditCard,
  Settings,
  BookOpen,
  LogOut,
  Coins,
  ExternalLink
} from "lucide-react"

interface SidebarProps {
  credits: number
}

export function Sidebar({ credits }: SidebarProps) {
  const pathname = usePathname()

  const navItems = [
    { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { name: "API Keys", href: "/api-keys", icon: Key },
    { name: "Usage", href: "/usage", icon: BarChart3 },
    { name: "Billing", href: "/billing", icon: CreditCard },
    { name: "Documentation", href: "/docs", icon: BookOpen },
  ]

  const bottomItems: { name: string; href: string; icon: typeof Settings }[] = [
    // Settings page coming soon
    // { name: "Settings", href: "/settings", icon: Settings },
  ]

  return (
    <div className="sidebar w-64 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="text-2xl font-bold text-gradient">Nacho API</div>
        </div>
        <div className="text-xs text-text-muted mt-1">for Cardano</div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
                          (item.href !== "/dashboard" && pathname?.startsWith(item.href))
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
        {/* Credit Balance */}
        <div className="p-4 bg-bg-tertiary rounded-lg">
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <Coins className="w-3 h-3" />
            <span>Credits for PAID Keys</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{credits.toLocaleString()}</div>
          <Link href="/billing">
            <span className="text-xs text-accent hover:text-accent-hover cursor-pointer mt-2 inline-block">
              Buy Credits
            </span>
          </Link>
        </div>

        {/* Bottom Navigation */}
        {bottomItems.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href}>
              <div className="sidebar-item">
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </div>
            </Link>
          )
        })}

        {/* Stake Pool Link */}
        <a
          href="https://nacho.builders"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-item text-text-muted hover:text-text-primary"
        >
          <ExternalLink className="w-5 h-5" />
          <span>Nacho STAKE</span>
        </a>

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




