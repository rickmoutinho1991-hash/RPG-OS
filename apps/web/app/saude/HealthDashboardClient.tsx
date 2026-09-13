"use client";

import { useState, useEffect } from "react";
import type { SessionContext } from "@rpg/core";

interface SaudeDashboardClientProps {
  ctx: SessionContext | null;
}

export function HealthDashboardClient({ ctx }: SaudeDashboardClientProps) {
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    provider: string;
    environment: string;
    lastSync?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await fetch("/api/saude/status");
        if (res.ok) {
          const data = await res.json();
          setConnectionStatus(data);
        }
      } catch (err) {
        console.error("[Saúde] Failed to load connection status:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStatus();
  }, []);

  const cards = [
    {
      title: "Receitas",
      icon: "💊",
      count: 0,
      href: "/saude/receitas",
      status: "PREPARED_ONLY",
    },
    {
      title: "Medicamentos",
      icon: "💊",
      count: 0,
      href: "/saude/medicamentos",
      status: "PREPARED_ONLY",
    },
    {
      title: "Vacinas",
      icon: "💉",
      count: 0,
      href: "/saude/vacinas",
      status: "PREPARED_ONLY",
    },
    {
      title: "Consultas",
      icon: "🏥",
      count: 0,
      href: "/saude/consultas",
      status: "PREPARED_ONLY",
    },
    {
      title: "Exames",
      icon: "🧪",
      count: 0,
      href: "/saude/exames",
      status: "PREPARED_ONLY",
    },
    {
      title: "Documentos",
      icon: "📄",
      count: 0,
      href: "/saude/documentos",
      status: "PREPARED_ONLY",
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "LIVE": return "bg-green-500";
      case "SANDBOX": return "bg-yellow-500";
      case "PREPARED_ONLY": return "bg-gray-400";
      default: return "bg-gray-400";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "LIVE": return "Live";
      case "SANDBOX": return "Sandbox";
      case "PREPARED_ONLY": return "Preparado";
      default: return "Preparado";
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              connectionStatus?.connected ? "bg-green-500" : "bg-gray-400"
            }`} />
            <div>
              <h3 className="font-medium">Estado da ligação SNS 24</h3>
              <p className="text-sm text-muted">
                {connectionStatus?.connected 
                  ? `${connectionStatus.provider} · ${connectionStatus.environment} · Última sync: ${connectionStatus.lastSync || "nunca"}`
                  : "Não ligado · Preparado para integração oficial"}
              </p>
            </div>
          </div>
          {!connectionStatus?.connected && (
            <button className="button primary" disabled>
              Configurar ligação SNS 24
            </button>
          )}
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <a
            key={card.title}
            href={card.href}
            className="card p-4 hover:border-primary/50 transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{card.icon}</span>
              <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(card.status)}`}>
                {getStatusLabel(card.status)}
              </span>
            </div>
            <h3 className="font-medium text-lg">{card.title}</h3>
            <p className="text-2xl font-bold text-primary group-hover:text-primary/80 transition-colors">
              {card.count}
            </p>
            <p className="text-xs text-muted mt-1">
              {card.status === "PREPARED_ONLY" 
                ? "Preparado para integração oficial" 
                : `${card.count} itens`}
            </p>
          </a>
        ))}
      </div>

      {/* Notifications / Alerts */}
      <div className="card p-4">
        <h3 className="font-medium mb-3">Notificações de Saúde</h3>
        <div className="text-center text-muted py-4">
          Nenhuma notificação pendente
        </div>
      </div>

      {/* Official Links */}
      <div className="card p-4">
        <h3 className="font-medium mb-3">Ligações aos Serviços Oficiais</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <a
            href="https://www.sns24.gov.pt"
            target="_blank"
            rel="noopener noreferrer"
            className="button secondary w-full justify-center"
          >
            SNS 24
          </a>
          <a
            href="https://www.spms.minsaude.pt"
            target="_blank"
            rel="noopener noreferrer"
            className="button secondary w-full justify-center"
          >
            SPMS
          </a>
          <a
            href="https://www.seg-social.pt"
            target="_blank"
            rel="noopener noreferrer"
            className="button secondary w-full justify-center"
          >
            Segurança Social
          </a>
          <a
            href="https://www.autenticacao.gov.pt"
            target="_blank"
            rel="noopener noreferrer"
            className="button secondary w-full justify-center"
          >
            Autenticação.gov
          </a>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="card p-4 bg-amber-50 border-amber-200">
        <div className="flex items-start gap-3">
          <span className="text-amber-600">⚠️</span>
          <div className="text-sm text-amber-800">
            <strong>Aviso:</strong> Este módulo está preparado para integração oficial com os 
            serviços do SNS 24 / SPMS / Segurança Social. 
            As funcionalidades requerem credenciais oficiais e onboarding autorizado junto 
            da SPMS / Ministério da Saúde. 
            Nenhum dado de saúde real é exibido sem integração oficial ativa.
          </div>
        </div>
      </div>
    </div>
  );
}