"use client"

import { signIn } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"

const errorMessages: Record<string, string> = {
  OAuthSignin: "Error starting OAuth sign in",
  OAuthCallback: "Error during OAuth callback",
  OAuthCreateAccount: "Could not create OAuth account",
  EmailCreateAccount: "Could not create email account",
  Callback: "Error during callback",
  OAuthAccountNotLinked: "This email is already associated with a different sign-in method",
  EmailSignin: "Error sending magic link email",
  CredentialsSignin: "Invalid credentials",
  SessionRequired: "Please sign in to access this page",
  Default: "An error occurred during sign in",
}

function LoginContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const errorParam = searchParams.get("error")
    if (errorParam) {
      setError(errorMessages[errorParam] || errorMessages.Default)
      console.error("[Login] Auth error:", errorParam)
    }
  }, [searchParams])

  const handleGoogleSignIn = async () => {
    setIsLoading("google")
    await signIn("google", { callbackUrl: "/dashboard" })
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading("email")
    try {
      await signIn("email", { email, callbackUrl: "/dashboard", redirect: false })
      setEmailSent(true)
    } catch {
      // Error handled by NextAuth
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-gradient-mesh opacity-30"></div>

      <Card className="w-full max-w-md relative z-10">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl">Welcome Back</CardTitle>
          <CardDescription>Sign in to access your Cardano APIs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          {/* Google */}
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={isLoading !== null}
          >
            {isLoading === "google" ? (
              <span className="animate-spin mr-2">⏳</span>
            ) : (
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-bg-secondary px-2 text-text-muted">Or continue with email</span>
            </div>
          </div>

          {/* Email */}
          {emailSent ? (
            <div className="text-center py-4 space-y-2">
              <div className="text-2xl">✉️</div>
              <p className="text-text-primary font-medium">Check your email</p>
              <p className="text-sm text-text-secondary">
                We sent a magic link to <span className="font-medium">{email}</span>
              </p>
              <Button
                variant="ghost"
                className="mt-4"
                onClick={() => setEmailSent(false)}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="input w-full"
                required
                disabled={isLoading !== null}
              />
              <Button type="submit" className="w-full" disabled={isLoading !== null}>
                {isLoading === "email" ? "Sending..." : "Send Magic Link"}
              </Button>
            </form>
          )}

          <p className="text-xs text-center text-text-muted pt-4">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="animate-pulse text-text-muted">Loading...</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}


