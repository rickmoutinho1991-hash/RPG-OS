import {
  DevicePlatform,
  DeviceSyncRequest,
  DeviceSyncResponse,
  PushNotificationPayload,
  RegisteredDevice,
} from "../types/integrations";

export interface IDeviceSyncAdapter {
  formatForSmartwatch(
    response: DeviceSyncResponse,
    platform: "APPLE_WATCH_OS" | "WEAR_OS",
  ): {
    title: string;
    complications: Record<string, string>;
    glanceItems: Array<{
      id: string;
      header: string;
      time: string;
      badge: string;
    }>;
  };
  createPushPayload(notification: {
    title: string;
    body: string;
    url?: string;
  }): PushNotificationPayload;
}

export class DeviceSyncAdapter implements IDeviceSyncAdapter {
  /**
   * Adapta os dados de sincronização para visualização em mostradores e complicações de relógios inteligentes
   */
  formatForSmartwatch(
    response: DeviceSyncResponse,
    platform: "APPLE_WATCH_OS" | "WEAR_OS",
  ) {
    const nextEvent = response.agendaEvents[0];
    const pendingMedication = response.medicationReminders.find(
      (m) => !m.isCompletedToday,
    );

    const complications = {
      modularLarge: nextEvent
        ? `${nextEvent.title} (${nextEvent.startTime.slice(11, 16)})`
        : "Sem tarefas",
      circularSmall: pendingMedication ? "💊" : "✓",
      cornerBadge: `${response.unreadNotificationsCount}`,
      systemPlatform: platform,
    };

    const glanceItems = [
      ...response.agendaEvents.slice(0, 3).map((ev) => ({
        id: ev.id,
        header: ev.title,
        time: ev.startTime
          ? new Date(ev.startTime).toLocaleTimeString("pt-PT", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "--:--",
        badge: ev.type,
      })),
      ...response.medicationReminders
        .filter((m) => !m.isCompletedToday)
        .slice(0, 2)
        .map((m) => ({
          id: m.id,
          header: m.title,
          time: m.scheduledTime?.slice(0, 5) || "Hoje",
          badge: "TOMA",
        })),
    ];

    return {
      title: "RPG-OS Watch",
      complications,
      glanceItems,
    };
  }

  /**
   * Cria payload standard para Web Push (W3C Push API) compatível com Safari/iOS, Chrome/Android e Desktop
   */
  createPushPayload(notification: {
    title: string;
    body: string;
    url?: string;
  }): PushNotificationPayload {
    return {
      title: notification.title,
      body: notification.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: "rpg-os-alert",
      data: {
        url: notification.url || "/dashboard",
        timestamp: Date.now(),
      },
      actions: [
        { action: "open", title: "Abrir RPG-OS" },
        { action: "dismiss", title: "Dispensar" },
      ],
    };
  }
}
