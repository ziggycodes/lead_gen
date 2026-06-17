// Niche catalog: maps a friendly niche key to the OSM tag filters used to find
// those businesses, a display label, and a "category" that drives the
// pain-point heuristics in painPoints.js.
//
// `filters` is an array of { k, v } tag selectors. A POI matches the niche if it
// matches ANY of the filters. The Overpass query expands each filter into both a
// node and a way/relation lookup.

export const NICHES = {
  dentist: {
    label: "Dental Practice",
    category: "appointment_medical",
    filters: [
      { k: "amenity", v: "dentist" },
      { k: "healthcare", v: "dentist" },
    ],
  },
  doctor: {
    label: "Medical Clinic / Doctor",
    category: "appointment_medical",
    filters: [
      { k: "amenity", v: "doctors" },
      { k: "healthcare", v: "doctor" },
      { k: "healthcare", v: "clinic" },
    ],
  },
  chiropractor: {
    label: "Chiropractor",
    category: "appointment_medical",
    filters: [{ k: "healthcare", v: "chiropractor" }],
  },
  physiotherapy: {
    label: "Physical Therapy",
    category: "appointment_medical",
    filters: [
      { k: "healthcare", v: "physiotherapist" },
      { k: "leisure", v: "fitness_centre" },
    ],
  },
  veterinary: {
    label: "Veterinary Clinic",
    category: "appointment_medical",
    filters: [{ k: "amenity", v: "veterinary" }],
  },
  optician: {
    label: "Optician / Eye Care",
    category: "appointment_medical",
    filters: [{ k: "shop", v: "optician" }],
  },
  pharmacy: {
    label: "Pharmacy",
    category: "retail_service",
    filters: [{ k: "amenity", v: "pharmacy" }],
  },

  salon: {
    label: "Hair Salon",
    category: "appointment_beauty",
    filters: [{ k: "shop", v: "hairdresser" }],
  },
  barber: {
    label: "Barber Shop",
    category: "appointment_beauty",
    filters: [{ k: "shop", v: "hairdresser" }, { k: "shop", v: "barber" }],
  },
  nails: {
    label: "Nail Salon",
    category: "appointment_beauty",
    filters: [{ k: "shop", v: "beauty" }, { k: "beauty", v: "nails" }],
  },
  spa: {
    label: "Spa / Wellness",
    category: "appointment_beauty",
    filters: [{ k: "leisure", v: "spa" }, { k: "shop", v: "massage" }, { k: "amenity", v: "spa" }],
  },
  tattoo: {
    label: "Tattoo Studio",
    category: "appointment_beauty",
    filters: [{ k: "shop", v: "tattoo" }],
  },

  plumber: {
    label: "Plumbing Contractor",
    category: "trades",
    filters: [{ k: "craft", v: "plumber" }, { k: "trade", v: "plumber" }],
  },
  electrician: {
    label: "Electrician",
    category: "trades",
    filters: [{ k: "craft", v: "electrician" }],
  },
  hvac: {
    label: "HVAC Contractor",
    category: "trades",
    filters: [{ k: "craft", v: "hvac" }, { k: "craft", v: "heating_engineer" }],
  },
  roofer: {
    label: "Roofing Contractor",
    category: "trades",
    filters: [{ k: "craft", v: "roofer" }],
  },
  locksmith: {
    label: "Locksmith",
    category: "trades",
    filters: [{ k: "shop", v: "locksmith" }, { k: "craft", v: "locksmith" }],
  },
  landscaper: {
    label: "Landscaping / Gardening",
    category: "trades",
    filters: [{ k: "craft", v: "gardener" }, { k: "shop", v: "garden_centre" }],
  },
  cleaner: {
    label: "Cleaning Service",
    category: "trades",
    filters: [{ k: "shop", v: "dry_cleaning" }, { k: "craft", v: "cleaning" }, { k: "office", v: "cleaning" }],
  },
  painter: {
    label: "Painting Contractor",
    category: "trades",
    filters: [{ k: "craft", v: "painter" }],
  },
  carpenter: {
    label: "Carpenter / Joiner",
    category: "trades",
    filters: [{ k: "craft", v: "carpenter" }],
  },

  restaurant: {
    label: "Restaurant",
    category: "food",
    filters: [{ k: "amenity", v: "restaurant" }],
  },
  cafe: {
    label: "Cafe / Coffee Shop",
    category: "food",
    filters: [{ k: "amenity", v: "cafe" }],
  },
  bar: {
    label: "Bar / Pub",
    category: "food",
    filters: [{ k: "amenity", v: "bar" }, { k: "amenity", v: "pub" }],
  },
  bakery: {
    label: "Bakery",
    category: "food",
    filters: [{ k: "shop", v: "bakery" }],
  },

  realestate: {
    label: "Real Estate Agency",
    category: "professional",
    filters: [{ k: "office", v: "estate_agent" }, { k: "shop", v: "estate_agent" }],
  },
  lawyer: {
    label: "Law Firm",
    category: "professional",
    filters: [{ k: "office", v: "lawyer" }],
  },
  accountant: {
    label: "Accounting Firm",
    category: "professional",
    filters: [{ k: "office", v: "accountant" }],
  },
  insurance: {
    label: "Insurance Agency",
    category: "professional",
    filters: [{ k: "office", v: "insurance" }],
  },
  financial: {
    label: "Financial Advisor",
    category: "professional",
    filters: [{ k: "office", v: "financial" }, { k: "office", v: "financial_advisor" }],
  },

  autorepair: {
    label: "Auto Repair Shop",
    category: "auto",
    filters: [{ k: "shop", v: "car_repair" }],
  },
  cardealer: {
    label: "Car Dealership",
    category: "auto",
    filters: [{ k: "shop", v: "car" }],
  },
  tires: {
    label: "Tire Shop",
    category: "auto",
    filters: [{ k: "shop", v: "tyres" }],
  },

  gym: {
    label: "Gym / Fitness Center",
    category: "membership",
    filters: [{ k: "leisure", v: "fitness_centre" }, { k: "leisure", v: "sports_centre" }],
  },
  petgrooming: {
    label: "Pet Grooming / Pet Services",
    category: "appointment_service",
    filters: [{ k: "shop", v: "pet_grooming" }, { k: "shop", v: "pet" }],
  },
  hotel: {
    label: "Hotel / Lodging",
    category: "hospitality",
    filters: [{ k: "tourism", v: "hotel" }, { k: "tourism", v: "motel" }],
  },
  childcare: {
    label: "Childcare / Daycare",
    category: "appointment_service",
    filters: [{ k: "amenity", v: "childcare" }, { k: "amenity", v: "kindergarten" }],
  },
};

export function getNiche(key) {
  return NICHES[key.toLowerCase().trim()];
}

export function listNicheKeys() {
  return Object.keys(NICHES);
}
