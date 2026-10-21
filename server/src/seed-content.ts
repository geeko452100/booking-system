/**
 * Demo content for each business type. The generator in seed-data.ts turns this into rows.
 * Photos live in client/public/img/<biz>/: team/<staff>.jpg and services/<image>.jpg.
 */
import type { BusinessType } from './business-types.js';

export type StaffKey = 'eleanor' | 'sam' | 'jordan';
export type Stage = 'new' | 'planning' | 'active' | 'review' | 'done';

interface Doc {
  name: string;
  category: string;
  file?: string;
}

export interface BusinessSeed {
  /** Job titles; the headshot is team/<key>.jpg. */
  team: Record<StaffKey, string>;
  services: { name: string; desc: string; dur: number; price: number; image: string }[];
  /** Notes put on some bookings (on every booking when `notesOnEvery` is set, e.g. the pet's name). */
  bookingNotes?: string[];
  notesOnEvery?: boolean;
  /** Tracked work (jobs, programs). Omitted for businesses that don't use it. */
  projects?: {
    templates: { kind: string; title: (lastName: string) => string }[];
    nextSteps: Partial<Record<Stage, string>>;
  };
  /** Documents the business asks clients for. Omitted for businesses without file exchange. */
  requestable?: Doc[];
  /** The demo client's hand-written story. Projects are referenced by index. */
  story: {
    projects?: { staff: StaffKey; title: string; kind: string; stage: Stage; nextStep?: string; nextInDays?: number; updatedAgo: number; createdAgo: number }[];
    documents?: (Doc & { status: 'requested' | 'received' | 'reviewed' | 'shared'; project?: number; note?: string; by?: StaffKey; ago: number; size?: number })[];
    messages: { from: StaffKey | 'client'; body: string; ago: number; unread?: boolean }[];
    /** Overrides the booking note for the demo client (their pet's name). */
    bookingNote?: string;
    /** Services the demo client is never booked for (a corgi doesn't get the cat groom). */
    avoidServices?: string[];
  };
  /** First message to other clients, then their reply. */
  welcome: string;
  inboxQuestions: string[];
}

export const SEED: Record<BusinessType, BusinessSeed> = {
  home: {
    team: { eleanor: 'Owner', sam: 'Lead HVAC Technician', jordan: 'Cleaning Team Lead' },
    services: [
      { name: 'AC tune-up', desc: 'Clean coils, check refrigerant and test the whole system', dur: 60, price: 12900, image: 'ac-tune-up' },
      { name: 'Furnace safety check', desc: 'Inspection, filter change and carbon monoxide test', dur: 60, price: 11900, image: 'furnace-check' },
      { name: 'Heating & cooling repair', desc: 'Diagnose and fix a system that isn’t keeping up', dur: 90, price: 18900, image: 'repair' },
      { name: 'New system estimate', desc: 'Free in-home quote for a new AC, furnace or heat pump', dur: 45, price: 0, image: 'estimate' },
      { name: 'Whole-home deep clean', desc: 'Top-to-bottom clean, inside appliances and baseboards included', dur: 240, price: 28900, image: 'deep-clean' },
      { name: 'Standard home cleaning', desc: 'Kitchen, bathrooms, dusting, floors and trash', dur: 120, price: 14900, image: 'standard-clean' },
    ],
    bookingNotes: [
      'Gate code 4471', 'Dog in the backyard, please use the side gate', 'Upstairs unit is the noisy one',
      'Please park on the street', 'Basement entrance is on the left', 'Call 10 minutes before arriving',
    ],
    projects: {
      templates: [
        { kind: 'AC replacement', title: (l) => `${l} home: AC replacement` },
        { kind: 'Furnace install', title: (l) => `${l} home: new furnace` },
        { kind: 'Deep cleaning', title: (l) => `${l} move-out deep clean` },
        { kind: 'Duct cleaning', title: (l) => `${l} home: duct cleaning` },
        { kind: 'Thermostat upgrade', title: (l) => `${l} home: smart thermostat` },
        { kind: 'Water heater', title: (l) => `${l} home: water heater replacement` },
      ],
      nextSteps: {
        new: 'Book a free estimate visit',
        planning: 'Approve the quote',
        active: 'Confirm the install day',
        review: 'Final walkthrough with the technician',
      },
    },
    requestable: [
      { name: 'Photo of the unit’s model plate', category: 'photo', file: 'model-plate.jpg' },
      { name: 'Photos of the problem area', category: 'photo', file: 'problem-area.jpg' },
      { name: 'Home warranty card', category: 'warranty', file: 'warranty.pdf' },
      { name: 'Signed quote', category: 'quote', file: 'signed-quote.pdf' },
    ],
    story: {
      projects: [
        { staff: 'sam', title: 'Central AC replacement', kind: 'AC replacement', stage: 'planning', nextStep: 'Approve the quote so we can order your unit', nextInDays: 4, updatedAgo: 0.2, createdAgo: 9 },
        { staff: 'jordan', title: 'Move-in deep clean, 3 bedrooms', kind: 'Deep cleaning', stage: 'active', nextStep: 'Leave a key in the lockbox', nextInDays: 3, updatedAgo: 2, createdAgo: 20 },
        { staff: 'sam', title: 'Furnace tune-up', kind: 'Maintenance', stage: 'done', updatedAgo: 35, createdAgo: 40 },
      ],
      documents: [
        { name: 'Photo of the outdoor unit’s model plate', category: 'photo', status: 'requested', project: 0, note: 'It’s the metal sticker on the side of the unit.', by: 'sam', ago: 3 },
        { name: 'Home warranty card', category: 'warranty', status: 'requested', project: 0, by: 'sam', ago: 3 },
        { name: 'Photos of the upstairs vents', category: 'photo', file: 'upstairs-vents.jpg', status: 'received', project: 0, ago: 1.5, size: 2_340_112 },
        { name: 'Signed service agreement', category: 'other', file: 'service-agreement.pdf', status: 'reviewed', ago: 40, size: 182_330 },
        { name: 'Quote: high-efficiency AC, two options', category: 'quote', file: 'Quote-AC-Replacement.pdf', status: 'shared', project: 0, note: 'Option B is the quieter unit, see page 2.', by: 'sam', ago: 0.2, size: 96_450 },
        { name: 'Deep clean checklist', category: 'other', file: 'Deep-Clean-Checklist.pdf', status: 'shared', project: 1, by: 'jordan', ago: 19, size: 64_900 },
        { name: 'Furnace inspection report', category: 'other', file: 'Furnace-Report.pdf', status: 'shared', project: 2, by: 'sam', ago: 35, size: 140_120 },
        { name: 'Invoice #1042', category: 'invoice', file: 'Invoice-1042.pdf', status: 'shared', project: 2, by: 'eleanor', ago: 35, size: 48_210 },
      ],
      messages: [
        { from: 'jordan', body: 'Hi Priya, Jordan here. Your move-in deep clean is booked! Anything you’d like us to focus on?', ago: 20 },
        { from: 'client', body: 'The kitchen cabinets and the upstairs bathroom, please. Thank you!', ago: 19.8 },
        { from: 'sam', body: 'Hi Priya, I’ve shared your AC replacement quote under Files. Option B is the quieter unit.', ago: 4 },
        { from: 'client', body: 'Thanks Sam. Does option B qualify for the energy rebate?', ago: 3.9 },
        { from: 'sam', body: 'It does, up to $500 back. Approve the quote when you’re ready and we’ll order the unit.', ago: 0.2, unread: true },
      ],
    },
    welcome: 'Thanks for choosing us! You can message the team here any time.',
    inboxQuestions: [
      'Is there an extra fee for after-hours calls?',
      'The AC is blowing warm air again. Can someone come today?',
      'Could you email me a copy of the invoice?',
      'Do you service heat pumps too?',
      'Can we move the cleaning to Friday?',
    ],
  },

  salon: {
    team: { eleanor: 'Owner & Master Stylist', sam: 'Senior Barber', jordan: 'Color Specialist' },
    services: [
      { name: 'Women’s cut & style', desc: 'Consultation, wash, precision cut and finish', dur: 60, price: 6500, image: 'womens-cut' },
      { name: 'Men’s haircut', desc: 'Classic or skin fade, finished with a hot towel', dur: 30, price: 3500, image: 'mens-cut' },
      { name: 'Beard trim & hot towel', desc: 'Shape-up, straight-razor line and beard oil', dur: 30, price: 3000, image: 'beard' },
      { name: 'Color & balayage', desc: 'Single-process color or hand-painted highlights', dur: 150, price: 16000, image: 'color' },
      { name: 'Blowout', desc: 'Wash and a smooth, bouncy blow-dry', dur: 45, price: 4500, image: 'blowout' },
      { name: 'Deep conditioning treatment', desc: 'Repairing mask and scalp massage', dur: 30, price: 4000, image: 'treatment' },
    ],
    bookingNotes: [
      'Wants to keep the length', 'Bringing inspiration photos', 'Sensitive scalp', 'Low fade, #2 on the sides',
      'Prefers a quiet appointment', 'Toddler joining, needs a booster seat',
    ],
    story: {
      messages: [
        { from: 'jordan', body: 'Hi Priya! Before your color appointment, could you send a couple of inspiration photos? It helps me plan the formula.', ago: 6 },
        { from: 'client', body: 'Will do! I’m thinking a warm caramel balayage.', ago: 5.9 },
        { from: 'jordan', body: 'Love that. I’ve set aside time for a gloss too, on the house this month. See you soon!', ago: 0.3, unread: true },
      ],
    },
    welcome: 'Thanks for booking with us! Message us here if you need to change anything.',
    inboxQuestions: [
      'Do you have any openings on Saturday?',
      'Can I add a beard trim to my booking?',
      'What products do you recommend for curly hair?',
      'Running 10 minutes late, sorry!',
      'Do you do kids’ cuts?',
    ],
  },

  fitness: {
    team: { eleanor: 'Owner & Head Coach', sam: 'Strength Coach', jordan: 'Personal Trainer' },
    services: [
      { name: 'Free intro session', desc: 'Meet a coach, tour the studio and talk goals', dur: 30, price: 0, image: 'intro' },
      { name: 'Personal training', desc: 'One-on-one coaching built around your goals', dur: 60, price: 8500, image: 'personal' },
      { name: 'Fitness assessment', desc: 'Movement screen, strength tests and body measurements', dur: 45, price: 6000, image: 'assessment' },
      { name: 'Small-group training', desc: 'Up to six people, coached as a team', dur: 60, price: 3500, image: 'small-group' },
      { name: 'Partner training', desc: 'Train with a friend or partner, one coach', dur: 60, price: 12000, image: 'partner' },
      { name: 'Nutrition coaching', desc: 'Habits, meal planning and a weekly check-in', dur: 45, price: 7000, image: 'nutrition' },
    ],
    bookingNotes: ['Bad left knee, no jumping', 'Training for a half marathon', 'Prefers early mornings', 'Bring resistance bands'],
    projects: {
      templates: [
        { kind: 'Strength', title: () => '12-week strength program' },
        { kind: 'Running', title: () => 'Half marathon prep' },
        { kind: 'Weight loss', title: () => '8-week fat-loss plan' },
        { kind: 'Rehab support', title: () => 'Back-to-training after injury' },
        { kind: 'Mobility', title: () => 'Mobility reset' },
        { kind: 'Body composition', title: () => 'Wedding-ready program' },
      ],
      nextSteps: {
        new: 'Book your free intro session',
        planning: 'Complete the fitness assessment',
        active: 'Log this week’s workouts',
        review: 'Monthly check-in and measurements',
      },
    },
    requestable: [
      { name: 'Health questionnaire', category: 'form', file: 'health-questionnaire.pdf' },
      { name: 'Liability waiver', category: 'waiver', file: 'waiver.pdf' },
      { name: 'Doctor’s clearance note', category: 'medical', file: 'clearance.pdf' },
      { name: 'Food log (3 days)', category: 'form', file: 'food-log.pdf' },
    ],
    story: {
      projects: [
        { staff: 'sam', title: '12-week strength program', kind: 'Strength', stage: 'active', nextStep: 'Week 5: add a third lifting day', nextInDays: 2, updatedAgo: 0.25, createdAgo: 30 },
        { staff: 'jordan', title: 'Nutrition reset', kind: 'Nutrition', stage: 'planning', nextStep: 'Send a 3-day food log', nextInDays: 5, updatedAgo: 3, createdAgo: 6 },
        { staff: 'eleanor', title: 'Spring 5K prep', kind: 'Running', stage: 'done', updatedAgo: 60, createdAgo: 120 },
      ],
      documents: [
        { name: 'Food log (3 days)', category: 'form', status: 'requested', project: 1, note: 'Photos or a quick list are fine, whatever is easiest.', by: 'jordan', ago: 3 },
        { name: 'Doctor’s clearance note', category: 'medical', status: 'requested', project: 0, note: 'Only needed before we start the heavier lifts.', by: 'sam', ago: 2 },
        { name: 'Health questionnaire', category: 'form', file: 'health-questionnaire.pdf', status: 'received', ago: 1.2, size: 182_330 },
        { name: 'Liability waiver', category: 'waiver', file: 'waiver-signed.pdf', status: 'reviewed', ago: 30, size: 96_450 },
        { name: 'Training plan: weeks 5–8', category: 'plan', file: 'Strength-Plan-Weeks-5-8.pdf', status: 'shared', project: 0, note: 'Week 8 is a lighter deload week.', by: 'sam', ago: 0.25, size: 140_120 },
        { name: 'Assessment results', category: 'plan', file: 'Assessment-Results.pdf', status: 'shared', project: 0, by: 'sam', ago: 29, size: 312_400 },
        { name: 'Starter meal plan', category: 'plan', file: 'Starter-Meal-Plan.pdf', status: 'shared', project: 1, by: 'jordan', ago: 5, size: 64_900 },
      ],
      messages: [
        { from: 'sam', body: 'Great session today, Priya. Your deadlift form is really coming along.', ago: 5 },
        { from: 'client', body: 'Thanks! My legs are sore but in a good way.', ago: 4.9 },
        { from: 'sam', body: 'I’ve shared your plan for weeks 5–8. We’re adding a third lifting day, so let me know which day works best.', ago: 0.25, unread: true },
      ],
    },
    welcome: 'Welcome to the studio! Message your coach here any time.',
    inboxQuestions: [
      'Can I switch to evening sessions?',
      'I tweaked my knee. Should we adjust tomorrow’s workout?',
      'Do you offer couples packages?',
      'Uploaded my food log!',
      'Is parking free at the studio?',
    ],
  },

  pet: {
    team: { eleanor: 'Owner & Groomer', sam: 'Lead Groomer', jordan: 'Bather & Groomer' },
    services: [
      { name: 'Full groom', desc: 'Bath, haircut, nails, ears and a bandana', dur: 120, price: 8500, image: 'full-groom' },
      { name: 'Bath & brush', desc: 'Shampoo, blow-dry, brush-out and nail trim', dur: 60, price: 5000, image: 'bath' },
      { name: 'Puppy’s first groom', desc: 'A gentle, short intro for puppies under 6 months', dur: 60, price: 4500, image: 'puppy' },
      { name: 'Cat grooming', desc: 'Bath or brush-out, lion cut on request', dur: 90, price: 9000, image: 'cat' },
      { name: 'De-shedding treatment', desc: 'Undercoat removal for double-coated breeds', dur: 90, price: 7500, image: 'deshed' },
      { name: 'Mini spa: nails & paw balm', desc: 'Nail trim, file and soothing paw balm', dur: 30, price: 2500, image: 'spa' },
    ],
    // Every grooming booking names the pet.
    bookingNotes: [
      'Bella, golden retriever', 'Max, goldendoodle (nervous of dryers)', 'Luna, shih tzu', 'Charlie, beagle',
      'Milo, Persian cat', 'Daisy, poodle mix', 'Cooper, labrador', 'Rosie, cavalier', 'Teddy, pomeranian',
    ],
    notesOnEvery: true,
    requestable: [
      { name: 'Rabies vaccination certificate', category: 'vaccination', file: 'rabies-certificate.pdf' },
      { name: 'Bordetella vaccination record', category: 'vaccination', file: 'bordetella.pdf' },
      { name: 'Vet contact & medical notes', category: 'medical', file: 'vet-notes.pdf' },
    ],
    story: {
      bookingNote: 'Biscuit, corgi',
      avoidServices: ['Cat grooming', 'Puppy’s first groom'],
      documents: [
        { name: 'Rabies vaccination certificate', category: 'vaccination', status: 'requested', note: 'Biscuit’s current one expires this month.', by: 'eleanor', ago: 0.2 },
        { name: 'Bordetella vaccination record', category: 'vaccination', file: 'bordetella-2026.pdf', status: 'received', ago: 1, size: 182_330 },
        { name: 'Vet contact & medical notes', category: 'medical', file: 'vet-info.pdf', status: 'reviewed', ago: 60, size: 64_900 },
        { name: 'Grooming report card', category: 'other', file: 'Biscuit-Report-Card.pdf', status: 'shared', note: 'Nails trimmed, ears cleaned, a little matting behind the ears.', by: 'sam', ago: 8, size: 96_450 },
        { name: 'Before & after photos', category: 'photo', file: 'Biscuit-before-after.jpg', status: 'shared', by: 'sam', ago: 8, size: 2_340_112 },
      ],
      messages: [
        { from: 'sam', body: 'Biscuit was a star today! I’ve shared his report card and some before-and-after photos.', ago: 8 },
        { from: 'client', body: 'He looks so fluffy! Thank you.', ago: 7.9 },
        { from: 'eleanor', body: 'Hi Priya, a quick reminder that Biscuit’s rabies certificate expires soon. Could you upload the new one before his next visit?', ago: 0.2, unread: true },
      ],
    },
    welcome: 'Thanks for trusting us with your pet! Message us here any time.',
    inboxQuestions: [
      'Can I drop Max off early tomorrow?',
      'Do you groom cats too?',
      'Bella has a hot spot on her leg. Is that OK for grooming?',
      'How long does a full groom usually take?',
      'Uploaded the vaccination record.',
    ],
  },
};
