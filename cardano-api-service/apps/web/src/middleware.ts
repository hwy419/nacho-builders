import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

/**
 * Middleware for route protection and hostname-based routing
 *
 * Handles:
 * 1. Hostname routing: nacho.builders → pool landing, app.nacho.builders → API dashboard
 * 2. Admin route protection requiring ADMIN role
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hostname = request.headers.get("host") || ""

  // Hostname-based routing for marketing site
  // nacho.builders (without app. subdomain) serves the pool landing page
  const isPoolDomain = hostname === "nacho.builders" ||
                       hostname === "www.nacho.builders" ||
                       hostname.startsWith("nacho.builders:")

  if (isPoolDomain) {
    // Rewrite root path to pool landing page
    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/pool", request.url))
    }
    // Allow API routes to pass through
    if (pathname.startsWith("/api/")) {
      return NextResponse.next()
    }
    // Allow static assets
    if (pathname.startsWith("/_next/") || pathname.startsWith("/favicon") || pathname.includes(".")) {
      return NextResponse.next()
    }
    // Redirect other paths to pool landing for now
    // In future, could support /pool/faq, /pool/about, etc.
    if (!pathname.startsWith("/pool")) {
      return NextResponse.redirect(new URL("/pool", request.url))
    }
  }

  // Admin route protection
  if (pathname.startsWith("/admin")) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    })

    // Not authenticated - redirect to login
    if (!token) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("callbackUrl", pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Check if user has admin role
    // Note: We can't make DB calls in middleware, so we rely on a secondary check in the layout
    // The token should have the role from the session callback
    // For extra security, the admin layout also checks the database

    // For now, we redirect non-authenticated users
    // The admin layout will handle the role check from the database
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon files
     */
    "/((?!_next/static|_next/image|favicon.ico|favicon.png).*)",
  ],
}
