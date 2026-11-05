"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    setStandalone(isStandalone());
    try {
      if (localStorage.getItem("ttc_install_dismissed") === "1") setDismissed(true);
    } catch {
      /* ignore */
    }
    if (isStandalone()) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    if (isIos()) setShowIos(true);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (standalone || dismissed) return null;
  if (!deferred && !showIos) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem("ttc_install_dismissed", "1");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-lg rounded-2xl border border-sky-400/40 bg-[#0a1a36]/95 p-3 shadow-[0_8px_40px_rgba(29,78,216,0.45)] backdrop-blur sm:inset-x-auto sm:right-4 sm:bottom-4 sm:left-auto">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-bold text-sky-100">Install Tic Tac Cool</p>
          {deferred ? (
            <p className="mt-0.5 text-white/65">
              Add it to your home screen for a full-screen app feel.
            </p>
          ) : (
            <p className="mt-0.5 text-white/65">
              On iPhone: tap <span className="font-semibold text-sky-300">Share</span> →{" "}
              <span className="font-semibold text-sky-300">Add to Home Screen</span>.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {deferred && (
              <button
                type="button"
                onClick={install}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold hover:bg-blue-500"
              >
                Install app
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
