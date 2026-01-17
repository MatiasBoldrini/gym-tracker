-- Migration: Create user_integrations table
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Create the table
CREATE TABLE IF NOT EXISTS public.user_integrations (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    spreadsheet_id TEXT,
    google_refresh_token_enc TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only access their own data
CREATE POLICY "Users can view own integration"
    ON public.user_integrations
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own integration"
    ON public.user_integrations
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integration"
    ON public.user_integrations
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_integrations_email ON public.user_integrations(email);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_user_integrations_updated
    BEFORE UPDATE ON public.user_integrations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.user_integrations TO authenticated;
