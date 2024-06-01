import type { NextAuthConfig, User } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import Facebook from "next-auth/providers/facebook"
import Twitter from "next-auth/providers/twitter"
import Keycloak from "next-auth/providers/keycloak"
import LinkedIn from "next-auth/providers/linkedin"

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession`, `auth` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      /** The user's postal address. */
      address: string
    } & User
  }

  interface User {
    foo?: string
  }
}

export default {
  debug: true,
  providers: [
    Credentials({
      credentials: { password: { label: "Password", type: "password" } },
      authorize(c) {
        if (c.password !== "password") return null
        return {
          id: "test",
          name: "Test User",
          email: "test@example.com",
        }
      },
    }),
    // GitHub,
    Google,
    // Keycloak,
    // Facebook,
    // Twitter,
    // LinkedIn,
  ].filter(Boolean) as NextAuthConfig["providers"],
  callbacks: {
    async jwt({ token, trigger, session, profile, account, providers }) {
      if (trigger === "update") token.name = session.user.name

      if (profile) {
        const userProfile: User = {
          id: token.sub,
          name: profile?.name,
          email: profile?.email,
          image: token?.picture,
        }

        return {
          access_token: account?.access_token,
          expires_at: account?.expires_at,
          refresh_token: account?.refresh_token,
          user: userProfile,
        }
      } else if (
        account?.expires_at &&
        Date.now() < account.expires_at * 1000
      ) {
        // Subsequent logins, if the `access_token` is still valid, return the JWT
        return token
      } else {
        // Subsequent logins, if the `access_token` has expired, try to refresh it
        if (!token.refresh_token) throw new Error("Missing refresh token")

        try {
          const googleProvider = providers.find(({ id }) => id === "google")
          const response = await fetch(googleProvider.token_endpoint, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: googleProvider.clientId,
              client_secret: googleProvider.clientSecret,
              grant_type: "refresh_token",
              refresh_token: account?.refresh_token!,
            }),
            method: "POST",
          })

          const responseTokens = await response.json()

          if (!response.ok) throw responseTokens

          return {
            // Keep the previous token properties
            ...token,
            access_token: responseTokens.access_token,
            expires_at: Math.floor(
              Date.now() / 1000 + (responseTokens.expires_in as number)
            ),
            // Fall back to old refresh token, but note that
            // many providers may only allow using a refresh token once.
            refresh_token: responseTokens.refresh_token ?? token.refresh_token,
          }
        } catch (error) {
          console.error("Error refreshing access token", error)
          // The error property can be used client-side to handle the refresh token error
          return { ...token, error: "RefreshAccessTokenError" as const }
        }
      }

      return token
    },
  },
  basePath: "/auth",
} satisfies NextAuthConfig
