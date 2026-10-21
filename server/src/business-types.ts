/** The kinds of business this app can be set up as. Kept free of Worker imports so the seed script can use it in Node. */
export const BUSINESS_TYPES = ['home', 'salon', 'fitness', 'pet'] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];
export const isBusinessType = (v: unknown): v is BusinessType => BUSINESS_TYPES.includes(v as BusinessType);
