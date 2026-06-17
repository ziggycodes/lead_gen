// Heuristic pain-point engine. Given a lead's niche category and contact signals,
// it returns the most likely pain point and a tailored AI voice-agent / automation
// pitch angle. Fully offline and free -- no API calls.

// Base pain point per niche category, framed around phone/booking workflows that
// AI voice agents and automations solve.
const CATEGORY_PROFILES = {
  appointment_medical: {
    painPoint:
      "Front desk is buried in phone calls for appointments, refills and questions; calls go to voicemail and patients don't always call back.",
    pitch:
      "AI voice agent to answer 24/7, book/reschedule appointments, send reminders, and cut no-shows.",
  },
  appointment_beauty: {
    painPoint:
      "Staff are with clients and can't answer the phone, so booking calls are missed and walk-in inquiries are lost.",
    pitch:
      "AI receptionist that answers every call, books appointments into the calendar, and follows up on cancellations.",
  },
  appointment_service: {
    painPoint:
      "Owner-operated, so calls get missed during jobs/sessions and scheduling is handled manually.",
    pitch:
      "AI voice agent to capture every inquiry, qualify it, and auto-schedule bookings.",
  },
  trades: {
    painPoint:
      "Crew is on job sites, so inbound calls (often emergencies) go unanswered and turn into lost jobs for competitors.",
    pitch:
      "24/7 AI answering + intake that captures the lead, qualifies the job, and texts you/dispatches automatically.",
  },
  food: {
    painPoint:
      "High call volume for reservations, takeout orders and hours questions ties up staff during rushes.",
    pitch:
      "AI voice agent to take reservations/orders, answer FAQs, and free up staff during peak hours.",
  },
  professional: {
    painPoint:
      "New-client inquiries hit voicemail and intake is manual, so hot leads cool off before follow-up.",
    pitch:
      "AI intake agent that answers instantly, qualifies leads, and books consultations on the calendar.",
  },
  auto: {
    painPoint:
      "Service desk is slammed, so quote and status-update calls get missed and customers go elsewhere.",
    pitch:
      "AI voice agent to handle quote requests, schedule service, and give automated status updates.",
  },
  membership: {
    painPoint:
      "Membership, class-booking and cancellation calls pile up while staff are on the floor.",
    pitch:
      "AI agent to handle sign-ups, class bookings, and retention follow-ups automatically.",
  },
  hospitality: {
    painPoint:
      "Booking and guest-service calls come in around the clock and overflow at peak times.",
    pitch:
      "24/7 AI voice agent for reservations, guest FAQs, and upsell/confirmation calls.",
  },
  retail_service: {
    painPoint:
      "Repetitive calls (stock, hours, prescriptions/orders) interrupt staff serving customers in person.",
    pitch:
      "AI voice agent to deflect routine calls and handle order/status questions automatically.",
  },
};

const DEFAULT_PROFILE = {
  painPoint:
    "Inbound calls are handled manually and get missed when staff are busy, leaking potential revenue.",
  pitch:
    "AI voice agent to answer every call, qualify the inquiry, and book/route it automatically.",
};

// Returns { painPoint, pitchAngle, signals } for a lead.
export function inferPainPoint(lead, nicheCategory) {
  const profile = CATEGORY_PROFILES[nicheCategory] || DEFAULT_PROFILE;
  const hasWebsite = Boolean(lead.website);
  const hasPhone = Boolean(lead.phone);
  const hasEmail = Boolean(lead.email);

  const signals = [];
  if (!hasWebsite) signals.push("no website (weak/zero web presence)");
  if (hasPhone && !hasWebsite) signals.push("phone-only (no online booking path)");
  if (!hasPhone) signals.push("no public phone (hard to reach / inquiries lost)");
  if (!hasEmail) signals.push("no public email (no async intake channel)");

  let painPoint = profile.painPoint;
  let pitchAngle = profile.pitch;

  // Sharpen the pain point based on digital-presence signals.
  if (!hasWebsite && hasPhone) {
    painPoint +=
      " They rely entirely on the phone with no website to capture leads, so every missed call is lost revenue.";
    pitchAngle +=
      " Pair it with a simple booking page / automation to give them an online lead-capture path.";
  } else if (!hasWebsite && !hasPhone) {
    painPoint +=
      " Minimal digital footprint overall -- almost no way for new customers to reach or book them online.";
    pitchAngle +=
      " Lead with a full presence + automation setup (booking, follow-up, missed-call text-back).";
  } else if (hasWebsite && !lead._tags?.["opening_hours"]) {
    painPoint += " Even with a website, after-hours calls likely go unanswered.";
    pitchAngle += " Emphasize 24/7 coverage for after-hours and overflow calls.";
  }

  return {
    painPoint,
    pitchAngle,
    signals: signals.join("; "),
  };
}
