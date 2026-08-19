import type { Metadata } from "next";
import Sidebar from "../components/layout/Sidebar";
import Topbar from "../components/layout/Topbar";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "RPG-OS",
  description: "Intelligent Business Operating System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT">
      <body>
        <div className="app-shell">
          <Sidebar />
          <main className="app-main">
            <Topbar />
            <div className="page-content">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}