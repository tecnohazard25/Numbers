import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const publicRoutes = ["/login", "/reset-password", "/auth/callback"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const { user, supabaseResponse } = await updateSession(request);

  // Allow public routes
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return supabaseResponse;
  }

  // Allow force-change-password for authenticated users
  if (pathname.startsWith("/force-change-password")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return supabaseResponse;
  }

  // Not authenticated → login
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated → let through, page-level checks handle the rest
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
