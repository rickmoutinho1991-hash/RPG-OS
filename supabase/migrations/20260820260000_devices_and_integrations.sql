
-- RPG-OS: Dispositivos Registados (Smartwatches, Wear OS, Apple Watch, Telemóveis & PWA)

CREATE TABLE IF NOT EXISTS public.registered_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    device_name TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'WEB_PWA', -- APPLE_WATCH_OS, WEAR_OS, ANDROID, IOS, WEB_PWA, DESKTOP
    device_type TEXT NOT NULL DEFAULT 'PWA', -- SMARTWATCH, MOBILE_PHONE, TABLET, DESKTOP, PWA
    push_subscription JSONB,
    push_token TEXT,
    last_sync_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_paired BOOLEAN NOT NULL DEFAULT TRUE,
    app_version TEXT DEFAULT '1.2.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_registered_devices_user_id ON public.registered_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_registered_devices_platform ON public.registered_devices(platform);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.registered_devices TO service_role;
