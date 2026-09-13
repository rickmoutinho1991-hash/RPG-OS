/**
 * RPG-OS Webhook Replay Protection
 * 
 * Prevents replay attacks on webhook endpoints by:
 * 1. Extracting a stable event ID from provider payload
 * 2. Storing processed event IDs with TTL
 * 3. Rejecting duplicate event IDs within the replay window
 * 
 * Storage: In-memory with TTL (for single-instance).
 * Production: Replace with Redis-backed store for multi-instance.
 */

import { NextRequest } from 'next/server';

interface ProcessedEvent {
  processedAt: number;
  provider: string;
}

// In-memory store with TTL cleanup
const processedEvents = new Map<string, ProcessedEvent>();
const REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanupTimer(): void {
  if (cleanupTimer) return;
  
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [eventId, event] of processedEvents.entries()) {
      if (now - event.processedAt > REPLAY_WINDOW_MS) {
        processedEvents.delete(eventId);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

function extractEventId(provider: string, payload: Record<string, unknown>): string | null {
  // Provider-specific event ID extraction
  switch (provider) {
    case 'STRIPE_CONNECT':
      return (payload.id as string) || null;
    case 'ADYEN_FOR_PLATFORMS':
      return (payload.eventCode as string) + ':' + (payload.pspReference as string) || null;
    case 'SIBS':
      return (payload.transactionId as string) || null;
    case 'FAKE':
      return (payload.id as string) || (payload.eventId as string) || null;
    default:
      // Generic: try common fields
      return (payload.id as string) || 
             (payload.event_id as string) || 
             (payload.eventId as string) || 
             null;
  }
}

export interface ReplayCheckResult {
  allowed: boolean;
  eventId: string | null;
  reason?: string;
}

/**
 * Check if webhook event has been processed before (replay protection)
 * Returns allowed=false if duplicate detected
 */
export function checkWebhookReplay(
  request: NextRequest,
  provider: string,
  payload: Record<string, unknown>
): ReplayCheckResult {
  startCleanupTimer();
  
  const eventId = extractEventId(provider, payload);
  
  if (!eventId) {
    return {
      allowed: false,
      eventId: null,
      reason: 'Unable to extract event ID from payload for replay protection',
    };
  }
  
  const compositeKey = `${provider}:${eventId}`;
  const existing = processedEvents.get(compositeKey);
  const now = Date.now();
  
  if (existing) {
    // Check if within replay window
    if (now - existing.processedAt < REPLAY_WINDOW_MS) {
      return {
        allowed: false,
        eventId: compositeKey,
        reason: 'Duplicate webhook event detected (replay attack prevention)',
      };
    }
    // Outside window, allow but update timestamp
  }
  
  // Mark as processed
  processedEvents.set(compositeKey, {
    processedAt: now,
    provider,
  });
  
  return {
    allowed: true,
    eventId: compositeKey,
  };
}

/**
 * Manually mark an event as processed (for idempotency keys)
 */
export function markEventProcessed(provider: string, eventId: string): void {
  startCleanupTimer();
  const compositeKey = `${provider}:${eventId}`;
  processedEvents.set(compositeKey, {
    processedAt: Date.now(),
    provider,
  });
}

/**
 * Check if an event was already processed (without marking)
 */
export function isEventProcessed(provider: string, eventId: string): boolean {
  const compositeKey = `${provider}:${eventId}`;
  const existing = processedEvents.get(compositeKey);
  
  if (!existing) return false;
  
  const now = Date.now();
  if (now - existing.processedAt > REPLAY_WINDOW_MS) {
    processedEvents.delete(compositeKey);
    return false;
  }
  
  return true;
}

/**
 * Get replay protection stats (for monitoring)
 */
export function getReplayProtectionStats(): {
  totalTracked: number;
  windowMs: number;
} {
  return {
    totalTracked: processedEvents.size,
    windowMs: REPLAY_WINDOW_MS,
  };
}

/**
 * Clear all processed events (for testing)
 */
export function clearReplayProtection(): void {
  processedEvents.clear();
}