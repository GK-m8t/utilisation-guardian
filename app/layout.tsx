import type { Metadata } from "next";
import { Fraunces, Geist } from "next/font/google";
import "./globals.css";
import { GuardianProvider } from "@/components/GuardianProvider";
import { Shell } from "@/components/Shell";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Utilisation Guardian",
  description:
    "A youth credit copilot that takes permissioned, guardrailed action to protect a first-time cardholder's score before the statement cuts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full">
        <GuardianProvider>
          <Shell>{children}</Shell>
        </GuardianProvider>
      </body>
    </html>
  );
}
