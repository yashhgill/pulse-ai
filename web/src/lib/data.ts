import type { Clinic, Contact, Medication } from './types';

export const USER = {
  name: 'Yashh',
  fullName: 'Demo User',
  age: 24,
  blood: 'O+',
  allergies: 'None recorded',
  conditions: 'None recorded',
  ic: '••••••-••-1234',
  home: 'Ayer Keroh, Melaka',
  // Demo coordinates — Ayer Keroh, Melaka
  lat: 2.2701,
  lng: 102.2835,
};

export const CONTACTS: Contact[] = [
  { id: 'c1', name: 'Mum', relation: 'Mother', phone: '+60 12-345 6789', primary: true },
  { id: 'c2', name: 'Dr. Lim Wei Jie', relation: 'Family GP', phone: '+60 17-220 4410', primary: false },
];

const today = (h: number, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

export const CLINICS: Clinic[] = [
  { id: 'k1', name: 'Klinik Sejahtera Ayer Keroh', area: 'Ayer Keroh', distanceKm: 2.1, rating: 4.4, specialties: ['General', 'Fever', 'Vaccination'], slots: [today(10, 30), today(11, 15), today(14), today(15, 30)], medilink: true },
  { id: 'k2', name: 'Klinik Keluarga Bukit Beruang', area: 'Bukit Beruang', distanceKm: 3.8, rating: 4.6, specialties: ['General', 'Minor procedures'], slots: [today(9, 45), today(12, 30), today(16, 45)], medilink: true },
  { id: 'k3', name: 'Poliklinik Anggerik Bandar Hilir', area: 'Bandar Hilir', distanceKm: 4.9, rating: 4.2, specialties: ['General', 'Women’s health'], slots: [today(13), today(17, 15)], medilink: true },
  { id: 'k4', name: 'Hospital Melaka (A&E)', area: 'Jalan Mufti Haji Khalil', distanceKm: 8.6, rating: 4.0, specialties: ['Emergency', '24 hours'], slots: [], medilink: false },
];

export const MEDS: Medication[] = [
  { id: 'm1', name: 'Vitamin D3', dose: '1000 IU', time: '08:00', taken: true },
  { id: 'm2', name: 'Omega-3', dose: '1 capsule', time: '13:00', taken: false },
  { id: 'm3', name: 'Cetirizine', dose: '10 mg · as needed', time: '21:00', taken: false },
];

// 24 hourly heart-rate averages for the Health page
export const HR_24H = [62, 60, 58, 57, 57, 59, 66, 78, 84, 76, 74, 79, 88, 82, 76, 75, 81, 96, 104, 86, 78, 74, 70, 66];
export const SLEEP = { total: '7h 12m', score: 82, stages: [ { name: 'Deep', mins: 88 }, { name: 'Core', mins: 236 }, { name: 'REM', mins: 98 }, { name: 'Awake', mins: 10 } ] };
export const STEPS_WEEK = [8420, 10210, 6980, 12040, 9030, 4410, 6420];
