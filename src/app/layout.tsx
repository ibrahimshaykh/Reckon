import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Space_Grotesk,
  Patrick_Hand,
  Architects_Daughter,
} from "next/font/google";
import Link from "next/link";
import {
  ClerkProvider,
  Show,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/dal";
import { isRtl } from "@/lib/i18n";
import { getDictionary } from "@/lib/dictionary";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { AppNav } from "@/components/app-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SkinController } from "@/components/skin-controller";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// The app's sketch skin runs on these two: Patrick Hand for body copy, since
// it stays legible at small sizes, and Architects Daughter for headings,
// which is scratchier and reads like a marker on paper.
const patrickHand = Patrick_Hand({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["400"],
});

const architectsDaughter = Architects_Daughter({
  variable: "--font-hand-display",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Reckon",
  description: "The shared-life hub for friend groups and roommates.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Lazily upserts the local User row from Clerk on every authenticated
  // request — there's no webhook, since one needs a public URL to reach
  // localhost in dev.
  const session = await getSession();
  const locale = session?.locale ?? "en";
  const dict = await getDictionary(locale);

  return (
    <ClerkProvider>
      <html
        lang={locale}
        dir={isRtl(locale) ? "rtl" : "ltr"}
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${patrickHand.variable} ${architectsDaughter.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col">
          <ThemeProvider>
          <SkinController />
          <SmoothScroll />
          <header className="sticky top-0 z-50 flex items-center gap-6 border-b border-rule bg-background/75 px-6 py-3 backdrop-blur-xl">
            <Link
              href="/"
              className="shrink-0 font-heading text-[0.9375rem] font-semibold tracking-[-0.01em]"
            >
              {dict.nav.appName}
            </Link>
            <Show when="signed-in">
              <AppNav dict={dict} />
            </Show>
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <ThemeToggle label={dict.nav.toggleTheme} />
              <Show when="signed-in">
                <Button
                  render={<Link href="/settings" />}
                  nativeButton={false}
                  variant="ghost"
                  size="sm"
                >
                  {dict.nav.settings}
                </Button>
                <UserButton />
              </Show>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <Button size="sm">{dict.nav.signIn}</Button>
                </SignInButton>
              </Show>
            </div>
          </header>
          <main className="flex flex-1 flex-col">{children}</main>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
