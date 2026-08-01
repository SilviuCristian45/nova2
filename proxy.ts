import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  // Creează un răspuns inițial pe care îl vom modifica
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Inițializează clientul Supabase special pentru Middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verificăm dacă utilizatorul are o sesiune validă
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Dacă NU este logat și încearcă să intre pe o pagină protejată (orice în afară de /login)
  if (!user && !request.nextUrl.pathname.startsWith("/login") && !request.nextUrl.pathname.startsWith('/register')) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Dacă ESTE logat și încearcă să meargă pe /login, îl trimitem pe dashboard
  if (user && request.nextUrl.pathname.startsWith("/login") && request.nextUrl.pathname.startsWith('/register')) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// Această configurație îi spune Next.js pe ce rute să ruleze "paznicul" (ignoră imaginile, css-ul, etc)
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}