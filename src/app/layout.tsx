import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <header className="flex items-center justify-between border-b px-6 py-3">
            <Link href="/" className="font-semibold">
              {dict.nav.appName}
            </Link>
            <div className="flex items-center gap-3">
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
        </body>
      </html>
    </ClerkProvider>
  );
}
