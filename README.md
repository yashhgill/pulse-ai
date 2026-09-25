# Pulse AI

Nova is a health companion that watches phone and watch sensors for falls, crashes and fainting, talks with you about symptoms, and calls for help when you can't.

## What works end to end

- Accounts, medical ID, emergency contacts and consent (PDPA), stored in Cloudflare D1.
- Safety Engine: sensor fusion in the app raises an incident; the server owns the escalation timeline. A 10 s check-in, then a 30 s warning, then dispatch. "I'm okay" cancels, "I need help" dispatches at once, SOS skips straight to dispatch.
- Dispatch: MERS 999 is **simulated** (a real integration needs authorisation). SMS to your emergency contacts is **real** when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` are set, otherwise simulated and logged.
- Dispatcher console for accounts listed in `ADMIN_EMAILS`: live incidents, location, medical ID (if consented), contacts, acknowledge and close.
- Nova chat: a deterministic safety classifier runs first, then Groq (`openai/gpt-oss-120b`) writes the reply. Critical messages open a check-in.
- Vitals upload, medication reminders, MediLink-style clinic booking, audit log.
- Works on phones: bottom tab bar, full-screen emergency sheet, installable as a PWA.

## Run locally

```bash
npm install
LLM_PROVIDER=mock JWT_SECRET=dev ADMIN_EMAILS=you@example.com npm run dev
npm test
```

## Deploy (Cloudflare)

Add these repository secrets, then push to `main`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `JWT_SECRET`, `GROQ_API_KEY`, `ADMIN_EMAILS`, and optionally `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. The workflow tests, creates the D1 database, migrates and deploys.

`deploy/ecs` has the same app packaged for a Huawei Cloud ECS (Node + SQLite).
