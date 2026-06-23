---
name: Audio transcription payload limits
description: Why the API server must raise its JSON body limit, and how mobile sends recorded audio for transcription.
---

# Base64 audio transcription path (mobile → API server)

The mobile app records audio (expo-av), reads it as base64 (expo-file-system/legacy),
and POSTs it to the `/ai/transcribe-voice` route (Gemini audio→text).

**Rule:** the API server's `express.json()` body limit MUST be raised (currently `"25mb"`)
or every transcription request fails with HTTP 413.

**Why:** base64 audio is multiple MB; Express's default JSON limit is 100kb, which silently
rejects all real recordings even though the code path looks correct.

**How to apply:**
- Keep `express.json({ limit: ... })` large enough for audio in `artifacts/api-server/src/app.ts`.
- Mobile guards payload size before POST (rejects oversized recordings) — keep that ceiling
  below the server limit.
- Send a MIME type derived from the recording file extension, not a hardcoded one — the
  HIGH_QUALITY preset produces `.m4a` (audio/mp4) on both platforms but deriving is safer.
