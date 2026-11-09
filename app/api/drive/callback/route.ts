import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { DRIVE_SCOPE, exchangeCode, revokeToken } from "@/lib/google-drive"
import { saveDriveLink } from "@/lib/drive-service"
import { STATE_COOKIE, driveUser } from "../session"

export const dynamic = "force-dynamic"

function sameText(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// Google sends the user back here. Checks the state, swaps the code for tokens and stores the link,
// then returns to /settings with ?drive=connected or ?drive=<problem>.
export async function GET(request: NextRequest) {
  const back = (result: string) => {
    const response = NextResponse.redirect(new URL(`/settings?drive=${result}#drive`, request.url))
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/drive" })
    return response
  }
  const session = await driveUser()
  if ("response" in session) return session.response

  const params = request.nextUrl.searchParams
  let saved: { state?: string; verifier?: string; user?: string } = {}
  try { saved = JSON.parse(request.cookies.get(STATE_COOKIE)?.value ?? "{}") } catch { saved = {} }
  if (!saved.state || !saved.verifier || saved.user !== session.user.id || !sameText(params.get("state") ?? "", saved.state)) return back("state")
  if (params.get("error")) return back(params.get("error") === "access_denied" ? "cancelled" : "error")
  const code = params.get("code")
  if (!code) return back("error")

  try {
    const tokens = await exchangeCode(code, saved.verifier)
    // The consent screen lets the user untick Drive; without it there is nowhere to back up to.
    if (!tokens.scopes.includes(DRIVE_SCOPE)) {
      const issued = tokens.refreshToken ?? tokens.accessToken
      if (issued) await revokeToken(issued)
      return back("scope")
    }
    if (!tokens.refreshToken) return back("error")
    await saveDriveLink(session.user.id, tokens.refreshToken, tokens.email)
    return back("connected")
  } catch (error) {
    console.error("Drive connection failed:", error)
    return back("error")
  }
}
