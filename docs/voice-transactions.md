# Voice transaction checks

Voice input produces an editable draft; users still review it before saving. Missing amounts,
unsupported currencies, and multiple/unclear movements must be clarified rather than guessed.
Relative dates use the caller's local calendar day. Mobile applies the source/destination
account ids returned by the server and keeps the review open until saving succeeds.

Audio JSON has a 20 MiB limit only on the authenticated transcription endpoint. The client
and server both cap base64 at 18,000,000 characters; other JSON endpoints keep their 1 MiB
limit. The server authenticates and rate-limits before reading the larger audio body.

## Automated validation

With Node 22+ and the workspace's pnpm dependencies installed:

```sh
pnpm run test:voice
pnpm run typecheck
pnpm --filter @workspace/finance-app run build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/finance-mobile exec expo export --platform android --output-dir /tmp/billy-android-check
```

Tests exercise the production date/amount/entity functions, component event handlers,
native recording lifecycle, generated API schemas, and HTTP request limits. Gemini responses,
authentication, and database queries are mocked: no production records or paid AI calls are used.
Expo export checks the Android JavaScript bundle; it is not a signed APK/AAB or a device test.

## Device smoke test before release

- Say “دفعت ٥٠٠ درهم من البنك لأحمد مبارح”: check amount, account, client, date and settlement status.
- Say “حوّلت ١٠٠٠ من البنك للكاش”: verify both account selectors before saving.
- Have two clients named أحمد علي and أحمد حسن; use only “أحمد” and verify a choice is requested.
- Mention a disabled currency and verify it is not replaced with the primary currency.
- Edit the recognized text and re-analyze it; verify the preview refreshes.
- Cancel during upload/analysis; verify late responses do not reopen the draft.
- Interrupt the network while saving; verify the draft stays available and a retry saves once.
- Deny microphone permission, use a silent recording, and try an oversized recording.
- Confirm voice works in the website's speech-recognition path and its MediaRecorder fallback.

Native microphone permissions and live transcription accuracy need physical-device testing.
Store signing, EAS credentials, and production deployment are separate from this change.
