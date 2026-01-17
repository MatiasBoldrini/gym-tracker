-- Migration: Add onboarding_progress JSONB to user_preferences
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS onboarding_progress JSONB;
