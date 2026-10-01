"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useGuardian } from "./GuardianProvider";
import { CaseStudyRail } from "./CaseStudyRail";
import { ConsentSheet } from "./ConsentSheet";
import { DemoDrawer } from "./DemoDrawer";
import { Toaster } from "./primitives";

const TABS = [
  {
    href: "/",
    label: "Home",
    icon: (
      <path d="M3.5 9.5 10 4l6.5 5.5V16a1 1 0 0 1-1 1h-3.6v-4.4H8.1V17H4.5a1 1 0 0 1-1-1V9.5Z" />
    ),
  },
  {
    href: "/chat",
    label: "Ask",
    icon: (
      <path d="M10 3.5c3.6 0 6.5 2.5 6.5 5.6 0 3.1-2.9 5.6-6.5 5.6-.8 0-1.6-.1-2.3-.4L4 16l.9-2.9c-.9-1-1.4-2.4-1.4-3.9 0-3.1 2.9-5.7 6.5-5.7Z" />
    ),
  },
  {
    href: "/activity",
    label: "Activity",
    icon: <path d="M3 10.5h3l2-5 4 9 2-4h3" />,
  },
];

/** Routes that take over the screen: no tab bar, back affordance instead. */
const FLOW_ROUTES = ["/guardian", "/autopay", "/settings", "/onboarding"];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, loading } = useGuardian();
  const [railVisible, setRailVisible] = useState(true);

  const isFlow = FLOW_ROUTES.some((r) => pathname.startsWith(r));
  const isOnboarding = pathname.startsWith("/onboarding");

  // First-run gate: the Guardian earns its permissions before it acts.
  useEffect(() => {
    if (!loading && state && !state.onboarded && !isOnboarding) {
      router.replace("/onboarding");
    }
  }, [loading, state, isOnboarding, router]);

  return (
    <div className="grain min-h-dvh w-full">
      {/* ambient backdrop glow behind the phone */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(56rem 36rem at 50% -8%, rgba(217,179,106,0.07), transparent 60%), radial-gradient(40rem 30rem at 85% 100%, rgba(127,176,138,0.045), transparent 65%)",
        }}
      />

      <div className="relative mx-auto flex min-h-dvh max-w-[1180px] items-stretch justify-center gap-14 px-0 sm:px-6">
        {/* the phone */}
        <main className="relative flex h-dvh w-full max-w-[410px] flex-col overflow-hidden sm:my-6 sm:h-[calc(100dvh-3rem)] sm:rounded-[2rem] sm:border sm:border-(--hairline) sm:bg-ink-2/60 sm:shadow-[0_40px_120px_rgba(0,0,0,0.55)]">
          <div className={`flex-1 overflow-y-auto px-5 pt-6 sm:px-6 sm:pt-7 ${isFlow ? "pb-8" : "pb-24"}`}>
            {children}
          </div>

          {/* bottom navigation — product surfaces only */}
          {!isFlow && (
            <nav
              aria-label="Main"
              className="absolute inset-x-0 bottom-0 z-10 sm:rounded-b-[2rem]"
              style={{
                background:
                  "linear-gradient(to top, rgba(8,9,13,0.96) 55%, rgba(8,9,13,0.7) 80%, transparent)",
              }}
            >
              <div className="mx-5 mb-4 mt-6 flex items-center justify-between rounded-2xl border border-(--hairline) bg-ink-3/90 px-2 py-1.5 backdrop-blur-md sm:mx-6">
                {TABS.map((tab) => {
                  const active = pathname === tab.href;
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] transition-colors ${
                        active ? "text-gold" : "text-faint hover:text-cream-2"
                      }`}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        {tab.icon}
                      </svg>
                      {tab.label}
                    </Link>
                  );
                })}
              </div>
            </nav>
          )}

          {/* overlays scoped to the phone frame */}
          <ConsentSheet />
          <Toaster />
        </main>

        {/* the case-study rail — wide screens only */}
        {state && railVisible && !isOnboarding && <CaseStudyRail />}
      </div>

      {/* demo harness — outside the product surface */}
      {!isOnboarding && <DemoDrawer railVisible={railVisible} setRailVisible={setRailVisible} />}
    </div>
  );
}
