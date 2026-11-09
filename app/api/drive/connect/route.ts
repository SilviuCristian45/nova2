import { NextResponse } from "next/server"
import { startAuthorization } from "@/lib/google-drive"
import { STATE_COOKIE, driveUser } from "../session"

export const dynamic = "force-dynamic"

// Starts the Google consent screen. The state (CSRF) and PKCE verifier wait in a short-lived httpOnly cookie,
// tied to the signed-in user.
export async function GET() {
  const session = await driveUser()
  if ("response" in session) return session.response
  const { state, verifier, url } = startAuthorization()
  const response = NextResponse.redirect(url)
  response.cookies.set(STATE_COOKIE, JSON.stringify({ state, verifier, user: session.user.id }), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/drive", maxAge: 600,
  })
  return response
}
