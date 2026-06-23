---
name: Voice/text transaction entity matching
description: How spoken client/trip/studio names are matched to existing records across Arabic↔English in the finance app
---

# Cross-language entity matching for voice/text entry

The finance app's voice/text transaction entry matches spoken client/trip/studio names
to existing records **inside Gemini**, not via client-side string matching.

**Rule:** The `/ai/parse-voice` route fetches the user's own clients/trips/studios
(scoped by `userId`) and passes their `{id, name}` lists to Gemini in the prompt.
Gemini does transliteration/phonetic matching (e.g. spoken "رشا" → stored "Rasha",
"studio noor" → "استديو النور") and returns the matched stored name + id. The route
then validates each returned id against sets built from the user's own rows before
sending it back (anti-IDOR / anti-hallucination).

**Why:** Pure `norm()` (lowercase/trim) string matching can never match across scripts
(Arabic vs Latin). Gemini already processes the text, so it is the right place to do
language-agnostic + mixed-language understanding.

**How to apply:**
- Frontend `advanceResolutionChain` must **trust a non-null AI-returned id directly**
  (the server already validated it). Do NOT re-gate it on the frontend list being
  loaded (`clients?.some(...)`) — that creates a duplicate-create race when the list
  hasn't loaded yet. Fall back to exact/fuzzy name matching only when the AI id is null.
- Any new field added to the parse-voice response must be added to `VoiceParseResult`
  in `lib/api-spec/openapi.yaml` then regenerated via
  `pnpm --filter @workspace/api-spec run codegen`. Fields missing from the spec get
  stripped by the generated zod schema.

**Browser STT limitation:** `SpeechRecognition.lang` must be a single locale; browsers
have no reliable bilingual auto-detect. It stays pinned to the UI language. True
mixed-language understanding happens in Gemini after transcription, not in the recognizer.
