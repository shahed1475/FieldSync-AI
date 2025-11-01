import NextAuth, { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcrypt"

const prisma = new PrismaClient()

export const authOptions: NextAuthOptions = {
  // Remove PrismaAdapter - it conflicts with JWT strategy and Credentials provider
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.log("❌ Missing credentials");
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          })

          if (!user || !user.password) {
            console.log("❌ User not found:", credentials.email);
            return null;
          }

          const isValid = await bcrypt.compare(credentials.password, user.password)

          if (!isValid) {
            console.log("❌ Invalid password for:", credentials.email);
            return null;
          }

          console.log("✅ Login successful:", user.email, "Role:", user.role);

          // Update last login
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          }
        } catch (error) {
          console.error("❌ Authorization error:", error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      // Initial sign in
      if (user) {
        token.userId = user.id
        token.email = user.email
        token.name = user.name
        token.role = (user as any).role
        console.log("🔑 JWT token created for user:", user.email, "with role:", (user as any).role);
      }
      return token
    },
    async session({ session, token }) {
      // Add user details to session
      if (session.user && token) {
        (session.user as any).id = token.userId || token.sub;
        (session.user as any).email = token.email;
        (session.user as any).name = token.name;
        (session.user as any).role = token.role;
        console.log("📝 Session created for user:", token.email, "with role:", token.role);
      }
      return session;
    },
    // 🔥 CRITICAL FIX: Add redirect callback for post-login navigation
    async redirect({ url, baseUrl }) {
      console.log("🔀 Redirect callback triggered - url:", url, "baseUrl:", baseUrl);

      // Allows relative callback URLs
      if (url.startsWith("/")) {
        console.log("✅ Redirecting to relative URL:", `${baseUrl}${url}`);
        return `${baseUrl}${url}`
      }
      // Allows callback URLs on the same origin
      if (new URL(url).origin === baseUrl) {
        console.log("✅ Redirecting to same origin:", url);
        return url
      }
      // Default redirect to admin dashboard
      console.log("✅ Redirecting to default /admin");
      return `${baseUrl}/admin`
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development", // Enable debug mode in development
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
