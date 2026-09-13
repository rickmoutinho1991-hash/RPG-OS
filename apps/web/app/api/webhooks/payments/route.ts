/**
 * RPG-OS Payment Webhook Endpoint
 * 
 * Endpoint para receber webhooks de providers de pagamento
 * Suporta múltiplos providers (Stripe, Adyen, SIBS)
 * FAKE provider is EXPLICITLY REJECTED in production
 * 
 * POST /api/webhooks/payments
 * 
 * Rate Limited: webhook category (50 req/min per IP)
 * Body Size Limited: webhook category (500 KB)
 * Replay Protection: Event ID deduplication (24h window)
 */

import { NextRequest, NextResponse } from 'next/server';
import { paymentEngine, PaymentProviderType } from '@rpg/core';
import { rateLimit, createRateLimitHeaders } from '@/lib/rate-limiter';
import { checkBodySizeLimit, createBodySizeLimitResponse } from '@/lib/body-size-limit';
import { checkWebhookReplay } from '@/lib/webhook-replay-protection';

const PRODUCTION_PROVIDER_TYPES: readonly PaymentProviderType[] = [
  'STRIPE_CONNECT',
  'ADYEN_FOR_PLATFORMS',
  'SIBS',
];

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function POST(request: NextRequest) {
  // Body size limit - webhook category (500 KB)
  const sizeResult = checkBodySizeLimit(request, 'webhook');
  if (!sizeResult.allowed) {
    return createBodySizeLimitResponse(sizeResult);
  }
  
  // Rate limiting - webhook category
  const rlResult = rateLimit(request, 'webhook');
  const rateLimitHeaders = createRateLimitHeaders(rlResult);
  
  if (!rlResult.allowed) {
    return NextResponse.json(
      { 
        error: 'Too Many Requests',
        message: 'Webhook rate limit exceeded. Try again later.',
      },
      { 
        status: 429,
        headers: rateLimitHeaders,
      }
    );
  }

  try {
    // 1. Extrair headers relevantes para verificação
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // 2. Identificar provider a partir do header (OBRIGATÓRIO)
    const providerHeader = headers['x-payment-provider'] as PaymentProviderType | undefined;
    
    if (!providerHeader) {
      return NextResponse.json(
        { error: 'Missing required header: x-payment-provider' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // 3. Validar provider - FAKE NUNCA é aceito em produção
    const allowedProviders = isProduction() 
      ? PRODUCTION_PROVIDER_TYPES 
      : [...PRODUCTION_PROVIDER_TYPES, 'FAKE'] as PaymentProviderType[];

    if (!allowedProviders.includes(providerHeader)) {
      return NextResponse.json(
        { error: `Invalid or unsupported payment provider: ${providerHeader}` },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const payload = await request.json();

    // 4. Replay Protection - check for duplicate webhook events
    const replayResult = checkWebhookReplay(request, providerHeader, payload);
    if (!replayResult.allowed) {
      return NextResponse.json(
        { 
          error: 'Duplicate webhook event',
          message: replayResult.reason || 'Event already processed',
          eventId: replayResult.eventId,
        },
        { status: 409, headers: rateLimitHeaders }
      );
    }

    // 5. Extrair signature se disponível
    const signature = headers['x-signature'] || headers['stripe-signature'] || headers['adyen-signature'];

    // 6. Processar webhook via Payment Engine
    const result = await paymentEngine.processWebhook({
      provider: providerHeader,
      payload,
      signature,
      headers,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // 7. Retornar sucesso
    return NextResponse.json({
      success: true,
      eventId: result.eventId,
      processed: true,
      replayProtected: true,
    }, { headers: rateLimitHeaders });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: rateLimitHeaders }
    );
  }
}

// Suportar HEAD para health checks
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}