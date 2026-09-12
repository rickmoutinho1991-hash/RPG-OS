"use client";

/**
 * PwaRegister — regista o service worker (PWA) de forma idempotente e
 * silenciosa. Só corre em produção e só no browser; falhas (ex.: dev sem
 * HTTPS) são ignoradas sem afetar o SSR/navegação normal. Não guarda
 * estado e não interfere com o shell da app.
 */
import { useEffect } from "react";

const IS_PROD =
  typeof process !== "undefined" &&
  typeof process.env !== "undefined" &&
  process.env.NODE_ENV === "production";

export default function PwaRegister() {
  useEffect(() => {
    if (!IS_PROD) return;
    if (!("serviceWorker" in navigator)) return;

    const ready = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* registo é progressivo — falha não bloqueia a navegação */
      });
    };

    if (document.readyState === "complete") {
      ready();
    } else {
      window.addEventListener("load", ready, { once: true });
    }
  }, []);

  return null;
}
