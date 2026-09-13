import type { Metadata, Viewport } from "next";
import "../styles/globals.css";
import { AppShell } from "../components/layout/AppShell";
export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export const metadata: Metadata = {
  title: "RPG-OS • Sistema Operativo de Gestão Empresarial",
  description: "Plataforma integrada de inteligência e gestão negocial para empresas, clientes e obras em Portugal.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RPG-OS",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "RPG-OS • Intelligent Business Operating System",
    description: "Gestão inteligente de empresas, obras, orçamentos e faturação certificada em Portugal.",
    url: "https://rpg-os.pt",
    siteName: "RPG-OS",
    locale: "pt_PT",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RPG-OS • Intelligent Business OS",
    description: "Gestão completa para profissionais, empresas, clínicas, consultores e construtoras.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
