import { useEffect, useState, useCallback } from "react";

export type FooterLang = "en" | "bn";

const KEY = "footer-lang";

function read(): FooterLang {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem(KEY);
  return v === "bn" ? "bn" : "en";
}

export function useFooterLang(): [FooterLang, (l: FooterLang) => void] {
  const [lang, setLangState] = useState<FooterLang>("en");

  useEffect(() => {
    setLangState(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setLangState(read());
    };
    const onCustom = () => setLangState(read());
    window.addEventListener("storage", onStorage);
    window.addEventListener("footer-lang-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("footer-lang-change", onCustom);
    };
  }, []);

  const setLang = useCallback((l: FooterLang) => {
    window.localStorage.setItem(KEY, l);
    setLangState(l);
    window.dispatchEvent(new CustomEvent("footer-lang-change"));
  }, []);

  return [lang, setLang];
}

export function LangToggle({
  lang,
  onChange,
}: {
  lang: FooterLang;
  onChange: (l: FooterLang) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center rounded-full border border-border bg-card p-0.5 text-xs font-semibold"
    >
      <button
        type="button"
        onClick={() => onChange("en")}
        className={
          "px-3 py-1 rounded-full transition-colors " +
          (lang === "en"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground")
        }
        aria-pressed={lang === "en"}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => onChange("bn")}
        className={
          "px-3 py-1 rounded-full transition-colors " +
          (lang === "bn"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground")
        }
        aria-pressed={lang === "bn"}
      >
        বাংলা
      </button>
    </div>
  );
}
