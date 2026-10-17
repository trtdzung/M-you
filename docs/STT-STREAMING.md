# Streaming voice input for M-Your

Press the microphone in M-Your, speak Vietnamese, then pause or press stop.
Partial transcripts stay hidden so unstable words never overwrite the user's
draft. While recording, the composer shows a short listening/finishing status.
The final transcript appears only after server-side refinement and stays editable;
the existing Send button submits it to the agent.
Closing the chat, switching persona, errors and timeouts stop microphone capture.

## Architecture

1. Browser requests `POST /api/stt/session` from the Next.js backend with a
   bounded vocabulary, typed entities (`id`, `type`, `label`, `aliases`) built
   from the user's current jar configuration, and the intents this screen uses.
2. Backend calls STT `POST /api/v1/stream-sessions` using `STT_SERVICE_API_KEY`.
3. Browser receives a 60-second, origin-bound ticket that also signs the bounded
   vocabulary, entities and intent allow-list (never the service key).
4. Browser opens WSS `/api/v1/transcriptions/stream` directly on the STT host.
5. First message authenticates with `{type: "start", token: "..."}`. Audio starts
   only after `ready`. AudioWorklet resamples to mono PCM16 LE at 16 kHz and sends
   100 ms binary packets. No WebM fragments, uploads or local audio persistence.
6. Server emits `partial`, then `finishing`, then `final`. PFM does not render the
   partial text. Stop flushes the final short audio packet before `{type: "stop"}`;
   `final` arrives after OpenAI refinement or its safe fallback. The stream closes
   after one utterance. The final refiner treats signed `hũ <tên hũ>` phrases as
   protected entities and rejects model output that renames, drops, or swaps
   their source/destination roles.
7. The final message also includes a validated `interpretation`. A jar transfer
   becomes actionable only with an amount, one unambiguous source jar, and one
   different destination jar. VoiceTab shows `clarification` and does not call
   the agent when information is missing, ambiguous, negated, or invalid. M-Your
   keeps the draft editable and shows the same specific follow-up below it.

Jar names are never hard-coded in the speech service. Renaming or adding a jar in
PFM changes the next microphone session automatically. OpenAI only repairs the
wording with this signed context; the local intent registry owns slot extraction
and business validation. New actions can be added as independent intent handlers
without expanding one global prompt.

This works with the existing Next.js standalone Docker image; it needs no custom
Next server or additional npm dependencies. The model integration uses repeated
PhoWhisper inference on accumulated audio, not a native streaming decoder. Partial
updates target 1 second of new audio; actual latency depends on inference speed.

## Configuration and deployment

In PFM runtime environment or `.env.local`:

```dotenv
STT_API_BASE_URL=https://endpoint-58b5fad9-b6e4-4f4b-ad57-26ae0e3cc0a5.agentbase-runtime.aiplatform.vngcloud.vn
STT_SERVICE_API_KEY=<same value as SERVICE_API_KEY on STT>
# Public browser origin, without trailing slash, when behind a reverse proxy:
APP_ORIGIN=https://your-pfm.example.com
```

Use `APP_ORIGIN=http://localhost:3000` for local testing (or omit it when the
request URL already matches the browser origin). The key may be empty only when
the STT service also has no service key configured. Never use `NEXT_PUBLIC_` for it.

Deploy the updated STT image first, with PhoWhisper dependencies/model and:

```dotenv
STT_PROVIDER=phowhisper
PHOWHISPER_MODEL_ID=vinai/PhoWhisper-base
PHOWHISPER_DEVICE=0
PHOWHISPER_PRELOAD=true
SERVICE_API_KEY=<your service secret>
STREAM_MAX_SESSIONS=2
```

Device `0` requires a CUDA-compatible image and assigned GPU. Use `-1` for CPU.
If model weights were bundled into the image, `HF_HUB_OFFLINE=1` avoids downloads.
Reuse the same service key across STT workers/replicas so tickets verify across
them; alternatively set a shared `STREAM_TOKEN_SECRET`. Without either secret,
development tickets only verify in the process that issued them.

GreenNode's gateway must forward WebSocket Upgrade/Origin and permit a persistent
connection for at least 180 seconds. The health check alone cannot verify this.
No CORS change is needed for this flow: ticket creation is server-to-server and
the WebSocket checks its Origin against the signed ticket. Redeploy/restart PFM
after setting its environment. An older STT image returns a clear streaming-not-
deployed error when the microphone is clicked.

## Defaults and limits

- One utterance per activation, up to 20 seconds of audio after speech starts;
  30 seconds total including initial silence. Pause threshold: 900 ms.
- Energy-based speech detection (`STREAM_VAD_THRESHOLD=0.012`), with 200 ms
  pre-roll and minimum 200 ms voiced audio. Tune against your actual microphones;
  this baseline is not a neural VAD and can misclassify background noise.
- Pending partials coalesce while inference runs; latest final audio is retained.
- Two active sessions per STT process by default; shared model inference is
  serialized with HTTP calls. This is bounded concurrency, not a throughput SLA.
- PCM messages at most 500 ms; client stops instead of dropping audio when
  outgoing backlog exceeds two seconds. Reconnect requires a fresh mic activation.
- Tickets are bearer credentials for 60 seconds, bound to a browser Origin;
  they are not a replacement for user authentication. PFM currently has only a
  demo client login. Production must enforce a real backend user session on the
  ticket route. No audio, transcript or ticket is logged by the new code.

## Verification

```sh
npm test -- src/lib/streaming-speech.test.ts src/lib/stt-pcm-worklet.test.ts src/app/api/stt/session/route.test.ts src/components/pfm/__tests__/MYourWidget.test.tsx
npx tsc --noEmit
npm run build
```

After both services are deployed, open PFM over HTTPS, grant microphone access,
and say a short Vietnamese sentence. Check that the typed draft remains unchanged
while speaking, a pause stops M-Your but does not stop VoiceTab while the button
is still held, the refined final text appears and remains editable, and Send uses
the existing agent API. An incomplete jar transfer must show the specific missing
field and must not be submitted automatically. Closing the chat during recording
must turn off the mic.
For server/gateway verification use `scripts/check_streaming.py` in the STT repo.
