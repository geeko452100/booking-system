import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export type BusinessType = 'home' | 'salon' | 'fitness' | 'pet';
export type Stage = 'new' | 'planning' | 'active' | 'review' | 'done';
export const STAGES: Stage[] = ['new', 'planning', 'active', 'review', 'done'];

/** Everything that changes between business types: names, wording, photos and which features are on. */
export interface BusinessConfig {
  type: BusinessType;
  name: string;
  /** Short label for the business-type picker. */
  label: string;
  tagline: string;
  icon: string;
  hero: { headline: string; copy: string };
  /** What each role is called. */
  roles: { admin: string; staff: string; client: string };
  words: {
    /** "visit", "appointment", "session" */
    booking: string;
    bookings: string;
    /** "technician", "stylist", "coach" */
    teamMember: string;
    client: string;
    clients: string;
    /** Page title for the services list. */
    services: string;
    /** "job", "program"; only used when the projects feature is on. */
    project: string;
    projects: string;
    /** Page title for file exchange, e.g. "Files", "Forms", "Pet records". */
    documents: string;
    /** Placeholder for the booking notes box. */
    bookingNotes: string;
  };
  features: { projects: boolean; documents: boolean };
  stages: Record<Stage, string>;
  stageHelp: Record<Stage, string>;
  projectKinds: string[];
  documentCategories: { key: string; label: string }[];
  /** Photo file names in /img/<type>/services, offered when editing a service. */
  serviceImages: string[];
  replyTime: string;
}

const noStages: Record<Stage, string> = { new: '', planning: '', active: '', review: '', done: '' };

export const BUSINESSES: Record<BusinessType, BusinessConfig> = {
  home: {
    type: 'home',
    name: 'Acme Home Services',
    label: 'Home services',
    tagline: 'Heating, cooling & cleaning',
    icon: 'house',
    hero: {
      headline: 'Book a visit, approve quotes and follow every job from one place.',
      copy: 'See when your technician is coming, send photos of the problem, pay invoices and message the team.',
    },
    roles: { admin: 'Owner', staff: 'Technician', client: 'Customer' },
    words: {
      booking: 'visit',
      bookings: 'visits',
      teamMember: 'technician',
      client: 'customer',
      clients: 'customers',
      services: 'Services',
      project: 'job',
      projects: 'jobs',
      documents: 'Files',
      bookingNotes: 'Anything we should know? Gate codes, pets, which unit is acting up…',
    },
    features: { projects: true, documents: true },
    stages: { new: 'Requested', planning: 'Quoted', active: 'Scheduled', review: 'In progress', done: 'Complete' },
    stageHelp: {
      new: 'We have your request and will be in touch to set up an estimate.',
      planning: 'Your quote is ready. Approve it and we’ll get you on the calendar.',
      active: 'Your job is booked and the parts are on order.',
      review: 'Our team is on it.',
      done: 'All done. Thanks for choosing us!',
    },
    projectKinds: ['AC replacement', 'Furnace install', 'Deep cleaning', 'Duct cleaning', 'Thermostat upgrade', 'Water heater', 'Maintenance'],
    documentCategories: [
      { key: 'photo', label: 'Photo' },
      { key: 'quote', label: 'Quote' },
      { key: 'invoice', label: 'Invoice' },
      { key: 'warranty', label: 'Warranty' },
      { key: 'other', label: 'Other' },
    ],
    serviceImages: ['ac-tune-up', 'furnace-check', 'repair', 'estimate', 'deep-clean', 'standard-clean'],
    replyTime: 'We usually reply within a couple of hours during business hours.',
  },
  salon: {
    type: 'salon',
    name: 'Acme Salon & Barber',
    label: 'Salon & barber',
    tagline: 'Cuts, color & grooming',
    icon: 'scissors',
    hero: {
      headline: 'Your next cut or color, booked in seconds.',
      copy: 'Pick your stylist, see your upcoming appointments, pay online and message the salon.',
    },
    roles: { admin: 'Owner', staff: 'Stylist', client: 'Client' },
    words: {
      booking: 'appointment',
      bookings: 'appointments',
      teamMember: 'stylist',
      client: 'client',
      clients: 'clients',
      services: 'Services & prices',
      project: '',
      projects: '',
      documents: '',
      bookingNotes: 'Anything your stylist should know? Inspiration, sensitivities…',
    },
    features: { projects: false, documents: false },
    stages: noStages,
    stageHelp: noStages,
    projectKinds: [],
    documentCategories: [],
    serviceImages: ['womens-cut', 'mens-cut', 'beard', 'color', 'blowout', 'treatment'],
    replyTime: 'We reply during salon hours, Tuesday to Saturday.',
  },
  fitness: {
    type: 'fitness',
    name: 'Acme Fitness Studio',
    label: 'Personal training',
    tagline: 'Personal & small-group training',
    icon: 'dumbbell',
    hero: {
      headline: 'Book sessions, follow your program and stay on track.',
      copy: 'See your training plan, upload your forms, book with your coach and message the studio.',
    },
    roles: { admin: 'Owner', staff: 'Coach', client: 'Member' },
    words: {
      booking: 'session',
      bookings: 'sessions',
      teamMember: 'coach',
      client: 'member',
      clients: 'members',
      services: 'Training options',
      project: 'program',
      projects: 'programs',
      documents: 'Forms & plans',
      bookingNotes: 'Anything your coach should know? Injuries, goals, equipment…',
    },
    features: { projects: true, documents: true },
    stages: { new: 'Intro', planning: 'Assessment', active: 'Training', review: 'Check-in', done: 'Complete' },
    stageHelp: {
      new: 'Let’s meet and talk about your goals.',
      planning: 'We’re measuring where you’re starting from.',
      active: 'You’re in the thick of your program. Keep it up!',
      review: 'Time to check your progress and adjust the plan.',
      done: 'Program complete. Great work!',
    },
    projectKinds: ['Strength', 'Running', 'Weight loss', 'Rehab support', 'Mobility', 'Nutrition', 'Body composition'],
    documentCategories: [
      { key: 'form', label: 'Form' },
      { key: 'waiver', label: 'Waiver' },
      { key: 'medical', label: 'Medical' },
      { key: 'plan', label: 'Plan' },
      { key: 'other', label: 'Other' },
    ],
    serviceImages: ['intro', 'personal', 'assessment', 'small-group', 'partner', 'nutrition'],
    replyTime: 'Your coach usually replies the same day.',
  },
  pet: {
    type: 'pet',
    name: 'Acme Pet Grooming',
    label: 'Pet grooming',
    tagline: 'Grooming for dogs & cats',
    icon: 'paw',
    hero: {
      headline: 'Happy pets, easy booking.',
      copy: 'Book grooming, keep vaccination records in one place, see report cards and message your groomer.',
    },
    roles: { admin: 'Owner', staff: 'Groomer', client: 'Client' },
    words: {
      booking: 'appointment',
      bookings: 'appointments',
      teamMember: 'groomer',
      client: 'client',
      clients: 'clients',
      services: 'Grooming services',
      project: '',
      projects: '',
      documents: 'Pet records',
      bookingNotes: 'Your pet’s name and breed, plus anything we should know',
    },
    features: { projects: false, documents: true },
    stages: noStages,
    stageHelp: noStages,
    projectKinds: [],
    documentCategories: [
      { key: 'vaccination', label: 'Vaccination record' },
      { key: 'medical', label: 'Medical notes' },
      { key: 'photo', label: 'Photo' },
      { key: 'other', label: 'Other' },
    ],
    serviceImages: ['full-groom', 'bath', 'puppy', 'cat', 'deshed', 'spa'],
    replyTime: 'We reply during opening hours, usually within an hour.',
  },
};

export const BUSINESS_TYPES = Object.keys(BUSINESSES) as BusinessType[];

export const teamPhoto = (type: BusinessType, photo: string | null | undefined) => (photo ? `/img/${type}/team/${photo}.jpg` : null);
export const servicePhoto = (type: BusinessType, image: string | null | undefined) =>
  `/img/${type}/services/${image || BUSINESSES[type].serviceImages[0]}.jpg`;

/** Capitalizes the first letter, for words used at the start of a sentence or title. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "a visit", "an appointment". */
export const indefinite = (word: string) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;

interface BusinessState {
  type: BusinessType;
  config: BusinessConfig;
  /** The owner's setting (what visitors see by default). */
  siteType: BusinessType;
  /** On the demo, switching only changes the current visitor's view. */
  demoMode: boolean;
  switchTo: (type: BusinessType) => Promise<void>;
}

const BusinessContext = createContext<BusinessState | null>(null);

interface BusinessResponse {
  type: BusinessType;
  siteType: BusinessType;
  demoMode: boolean;
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BusinessResponse | null>(null);

  useEffect(() => {
    api
      .get<BusinessResponse>('/business')
      .then(setState)
      .catch(() => setState({ type: 'home', siteType: 'home', demoMode: false }));
  }, []);

  useEffect(() => {
    if (!state) return;
    document.documentElement.dataset.biz = state.type;
    document.title = BUSINESSES[state.type].name;
  }, [state]);

  if (!state) return null;

  const switchTo = async (type: BusinessType) => {
    await api.put('/business', { type });
    // Every page's data depends on the business, so start fresh rather than refetching piecemeal.
    window.location.reload();
  };

  return (
    <BusinessContext.Provider value={{ ...state, config: BUSINESSES[state.type], switchTo }}>{children}</BusinessContext.Provider>
  );
}

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used inside BusinessProvider');
  return ctx;
}
