export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  JWT_SECRET?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  LLM_PROVIDER?: string;        // 'groq' (default) | 'mock' (tests)
  ADMIN_EMAILS?: string;        // become admin (and dispatcher) on sign-up / sign-in
  TWILIO_ACCOUNT_SID?: string;  // optional: real SMS to emergency contacts
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;         // Twilio number, E.164
  APP_RUNTIME?: string;
}
export interface AuthUser { id: string; email: string; role: string; name: string }
export type AppVars = { user: AuthUser };
