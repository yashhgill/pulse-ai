// ── Nova state machine ─────────────────────────────────────────────────────
export const NOVA_STATES = [
  'idle', 'listening', 'thinking', 'talking', 'happy', 'concerned',
  'sleeping', 'appointment', 'fall_detected', 'emergency', 'safe',
] as const;
export type NovaState = typeof NOVA_STATES[number];

// ── Emergency escalation ───────────────────────────────────────────────────
// idle → checking (10s "are you okay?") → escalating (30s) → locating → alerted
//                  ↘ cancelled (user responds "I'm okay")
//                  ↘ conscious (user responds "I need help") → alerted
export type EmergencyPhase =
  | 'idle' | 'checking' | 'escalating' | 'locating' | 'alerted' | 'cancelled';

export type ScenarioId = 'fall' | 'crash' | 'faint' | 'drop' | 'still';

export type SensorKey = 'accel' | 'gyro' | 'speed' | 'hr' | 'spo2' | 'motion';

export interface SensorFrame {
  t: number;
  accel: number;   // g
  gyro: number;    // rad/s
  speed: number;   // km/h
  hr: number;      // bpm
  spo2: number;    // %
  motion: number;  // 0..1 activity
}

export interface FusionResult {
  confidence: number;         // 0..1
  incident: 'none' | 'fall' | 'crash' | 'syncope' | 'inactivity';
  contributions: { key: SensorKey; label: string; weight: number }[];
}

export interface Incident {
  id: string;
  scenario: ScenarioId;
  label: string;
  result: FusionResult;
  startedAt: number;
  conscious: boolean | null;
  lat?: number | null;
  lng?: number | null;
  notifications?: { channel: string; target: string; status: string; detail: string | null; at: string }[];
  ackBy?: string | null;
}

/** Incident as returned by the Pulse API. */
export interface ServerIncident {
  id: string; kind: string; kindLabel: string; label: string | null; confidence: number | null;
  contributions: { key?: string; label: string; weight: number }[]; stage: string; conscious: number | null;
  lat: number | null; lng: number | null; accuracy_m: number | null; vitals: { hr?: number; spo2?: number } | null;
  created_at: string; alerted_at: string | null; ack_at: string | null; ack_by: string | null; resolved_at: string | null; notes: string | null;
  countdown: number; speed: number; notifications: { channel: string; target: string; status: string; detail: string | null; at: string }[];
}

export interface Me {
  id: string; name: string; email: string; role: string; phone: string | null; blood: string | null; allergies: string | null; conditions: string | null;
  home_address: string | null; home_lat: number | null; home_lng: number | null; consent_location: number; consent_health: number; consent_contacts: number;
}

export type Urgency = 'none' | 'low' | 'moderate' | 'high' | 'critical';

export interface PipelineStep {
  name: string;
  detail: string;
}

export type ActionType = 'emergency' | 'book' | 'health' | 'breathing' | 'safe';
export interface NovaAction { type: ActionType; label: string }

export interface ChatMessage {
  id: string;
  role: 'user' | 'nova';
  text: string;
  urgency?: Urgency;
  pipeline?: PipelineStep[];
  actions?: NovaAction[];
  sources?: string[];
}

export interface Contact {
  id: string;
  name: string;
  relation: string;
  phone: string;
  primary: boolean;
}

export interface Clinic {
  id: string;
  name: string;
  area: string;
  distanceKm: number;
  rating: number;
  specialties: string[];
  slots: string[];
  medilink: boolean;
}

export interface Appointment {
  id: string;
  clinicId: string;
  clinicName: string;
  date: string;
  time: string;
  reason: string;
  ref: string;
  status: 'requested' | 'confirmed';
}

export interface Medication {
  id: string;
  name: string;
  dose: string;
  time: string;
  taken: boolean;
}

export interface LogEvent {
  id: string;
  at: number;
  kind: 'nova' | 'safety' | 'health' | 'booking' | 'system';
  text: string;
}
