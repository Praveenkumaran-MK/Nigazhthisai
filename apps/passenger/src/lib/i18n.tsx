/**
 * Full Bilingual & Auto-Translation Engine for the Passenger PWA.
 * Supports English (en) and Tamil (ta).
 * Language preference is persisted to localStorage.
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type Language = "en" | "ta";

const STORAGE_KEY = "ngz_lang";

// Legacy static keys preserved for backward compatibility
export const strings = {
  en: {
    // Home
    whereHeaded: "Where are you headed?",
    ticketsSavedDevice: "Tickets saved to this device",
    route: "Route",
    from: "From",
    to: "To",
    selectRoute: "Select a route",
    selectOrigin: "Select origin",
    selectDest: "Select destination",
    selectRouteFirst: "Select a route first",
    searchBuses: "Search Buses",
    locatingYou: "Locating you…",
    locationUseNote: "We use your location only to suggest your nearest stop.",
    locationDenied: "Location permission was denied. Select your stops manually above.",
    locationUnavailable: "We couldn't detect your location. Select your stops manually above.",
    nearestStop: "Nearest stop",
    nearestStopAway: "m away — pick a route above to use it as your origin.",
    // Announcements
    serviceAlert: "Service Alert",
    // Search
    selectBus: "Select Bus",
    busesAvailable: "buses available",
    busAvailable: "bus available",
    searching: "Searching…",
    noBusesAvailable: "No buses available right now",
    noBusesDesc: "Every bus on this route has already passed your stop, or none are currently in service. Try again shortly.",
    busOccupancy: "Bus Occupancy",
    seatsFilled: "SEATS FILLED",
    pricePerSeat: "Price per seat",
    track: "Track",
    bookNow: "Book Now",
    full: "Full",
    currentlyNear: "Currently near",
    enRoute: "En route",
    accessible: "Accessible",
    direct: "Direct",
    // Checkout
    checkout: "Checkout",
    numberOfPassengers: "Number of passengers",
    concessionType: "Concession Type",
    totalFare: "Total fare",
    payingTo: "Paying to:",
    payButton: "Pay",
    processingPayment: "Processing payment…",
    issuingTicket: "Issuing ticket…",
    paymentReceived: "Payment received",
    paymentFailed: "Payment failed",
    paymentsUnavailable: "Ticket purchases are currently unavailable. Please try again later.",
    loadingPayment: "Still loading payment configuration — please try again in a moment.",
    // Concession
    concNormal: "Normal",
    concStudent: "Student (50% off)",
    concSenior: "Senior Citizen (50% off)",
    concMonthlyPass: "Monthly Commuter Pass",
    concFreedomFighter: "Freedom Fighter (Free)",
    // My Tickets
    myTickets: "My Tickets",
    ticketsOnDevice: "Tickets bought on this device.",
    loadingTickets: "Loading your tickets…",
    noTicketsYet: "No tickets yet",
    noTicketsDesc: "Tickets you buy will show up here — they're tied to this browser, not an account.",
    passengers: "passengers",
    passenger: "passenger",
    // Ticket detail
    loadingTicket: "Loading ticket…",
    approachingDest: "Approaching your destination",
    approachingDesc1: "We've sent you a reminder to check you've alighted.",
    approachingDesc2: "You're near your stop.",
    ticketValidated: "Ticket validated",
    ticketValidatedDesc: "Your ticket was scanned by the conductor. Enjoy your ride!",
    tripComplete: "Trip complete",
    tripCompleteDesc: "This ticket has expired — thanks for riding with us.",
    rateYourTrip: "Rate Your Trip",
    rateAndFeedback: "Rate & Feedback",
    // Grievance
    grievanceTitle: "Report an Issue",
    grievanceDesc: "Tell us what went wrong. We'll review and respond.",
    complaintType: "Complaint Type",
    description: "Description (optional)",
    descPlaceholder: "Describe the issue in detail…",
    submit: "Submit Report",
    submitting: "Submitting…",
    grievanceSuccess: "Your complaint was submitted. Reference: ",
    grievanceFailed: "Could not submit — please try again.",
    selectTrip: "Link to a recent trip (optional)",
    noRecentTickets: "No recent tickets",
    // Nav
    home: "Home",
    tickets: "My Tickets",
    grievance: "Report",
    // Offline
    offline: "You're offline — live tracking and ticket purchase are unavailable until you reconnect.",
    // Common
    back: "Back",
    retry: "Retry",
    loading: "Loading…",
    connecting: "Could not connect",
    settingUp: "Setting up your session…",
    // Complaint types
    cleanliness: "Cleanliness",
    driverBehavior: "Driver Behavior",
    overcrowding: "Overcrowding",
    safety: "Safety",
    overcharging: "Overcharging",
    other: "Other",
    // Rating
    excellent: "Excellent",
    good: "Good",
    average: "Average",
    poor: "Poor",
    terrible: "Terrible",
    ratingSubmitted: "Thank you for your feedback!",
    ratingFailed: "Could not save rating — please try again.",
    skipRating: "Skip",
    submitRating: "Submit Rating",
  },
  ta: {
    // Home
    whereHeaded: "எங்கே போக வேண்டும்?",
    ticketsSavedDevice: "இந்த சாதனத்தில் டிக்கெட்டுகள் சேமிக்கப்பட்டன",
    route: "வழித்தடம்",
    from: "இருந்து",
    to: "வரை",
    selectRoute: "வழித்தடத்தைத் தேர்ந்தெடுக்கவும்",
    selectOrigin: "புறப்படும் இடத்தை தேர்ந்தெடுக்கவும்",
    selectDest: "சேருமிடத்தைத் தேர்ந்தெடுக்கவும்",
    selectRouteFirst: "முதலில் வழித்தடத்தைத் தேர்ந்தெடுக்கவும்",
    searchBuses: "பேருந்துகளைத் தேடுக",
    locatingYou: "உங்கள் இருப்பிடம் கண்டறியப்படுகிறது…",
    locationUseNote: "அருகிலுள்ள நிறுத்தத்தைப் பரிந்துரைக்க மட்டுமே இருப்பிடத்தைப் பயன்படுத்துகிறோம்.",
    locationDenied: "இருப்பிட அனுமதி மறுக்கப்பட்டது. நிறுத்தங்களை கைமுறையாகத் தேர்ந்தெடுக்கவும்.",
    locationUnavailable: "இருப்பிடத்தைக் கண்டறிய முடியவில்லை. நிறுத்தங்களை கைமுறையாகத் தேர்ந்தெடுக்கவும்.",
    nearestStop: "அருகிலுள்ள நிறுத்தம்",
    nearestStopAway: "மீ தூரத்தில் — புறப்படும் இடமாகப் பயன்படுத்த மேலே ஒரு வழித்தடத்தைத் தேர்ந்தெடுக்கவும்.",
    // Announcements
    serviceAlert: "சேவை அறிவிப்பு",
    // Search
    selectBus: "பேருந்தைத் தேர்ந்தெடுக்கவும்",
    busesAvailable: "பேருந்துகள் உள்ளன",
    busAvailable: "பேருந்து உள்ளது",
    searching: "தேடப்படுகிறது…",
    noBusesAvailable: "தற்போது பேருந்துகள் இல்லை",
    noBusesDesc: "இந்த வழித்தடத்தின் அனைத்து பேருந்துகளும் சென்றுவிட்டன அல்லது சேவையில் இல்லை. சிறிது நேரம் கழித்து முயற்சிக்கவும்.",
    busOccupancy: "பேருந்து நிரம்பல் நிலை",
    seatsFilled: "இருக்கைகள் நிரம்பின",
    pricePerSeat: "ஒரு இருக்கைக்கான கட்டணம்",
    track: "கண்காணி",
    bookNow: "முன்பதிவு செய்",
    full: "நிரம்பியது",
    currentlyNear: "தற்போது அருகில்",
    enRoute: "வழியில் உள்ளது",
    accessible: "அணுகக்கூடியது",
    direct: "நேரடி",
    // Checkout
    checkout: "கட்டணம் செலுத்துதல்",
    numberOfPassengers: "பயணிகள் எண்ணிக்கை",
    concessionType: "சலுகை வகை",
    totalFare: "மொத்த கட்டணம்",
    payingTo: "செலுத்தப்படும் நிறுவனம்:",
    payButton: "செலுத்து",
    processingPayment: "கட்டணம் செயலாக்கப்படுகிறது…",
    issuingTicket: "டிக்கெட் வழங்கப்படுகிறது…",
    paymentReceived: "கட்டணம் பெறப்பட்டது",
    paymentFailed: "கட்டணம் தோல்வியடைந்தது",
    paymentsUnavailable: "டிக்கெட் முன்பதிவு தற்போது கிடைக்கவில்லை. சிறிது நேரம் கழித்து முயற்சிக்கவும்.",
    loadingPayment: "கட்டண அமைப்பு ஏற்றப்படுகிறது — சிறிது நேரம் கழித்து முயற்சிக்கவும்.",
    // Concession
    concNormal: "சாதாரண",
    concStudent: "மாணவர் (50% சலுகை)",
    concSenior: "மூத்த குடிமக்கள் (50% சலுகை)",
    concMonthlyPass: "மாதாந்திர பாஸ்",
    concFreedomFighter: "தியாகிகள் (இலவசம்)",
    // My Tickets
    myTickets: "எனது டிக்கெட்டுகள்",
    ticketsOnDevice: "இந்த சாதனத்தில் வாங்கப்பட்ட டிக்கெட்டுகள்.",
    loadingTickets: "டிக்கெட்டுகள் ஏற்றப்படுகின்றன…",
    noTicketsYet: "டிக்கெட்டுகள் எதுவும் இல்லை",
    noTicketsDesc: "நீங்கள் வாங்கும் டிக்கெட்டுகள் இங்கே தோன்றும் — அவை உலாவியுடன் இணைக்கப்பட்டுள்ளன.",
    passengers: "பயணிகள்",
    passenger: "பயணி",
    // Ticket detail
    loadingTicket: "டிக்கெட் ஏற்றப்படுகிறது…",
    approachingDest: "சேருமிடம் நெருங்குகிறது",
    approachingDesc1: "இறங்குவதை உறுதிப்படுத்த நினைவூட்டல் அனுப்பியுள்ளோம்.",
    approachingDesc2: "உங்கள் நிறுத்தத்தின் அருகில் உள்ளீர்கள்.",
    ticketValidated: "டிக்கெட் சரிபார்க்கப்பட்டது",
    ticketValidatedDesc: "உங்கள் டிக்கெட் நடத்துனரால் சரிபார்க்கப்பட்டது. பயணம் சிறக்கட்டும்!",
    tripComplete: "பயணம் முடிவடைந்தது",
    tripCompleteDesc: "இந்த டிக்கெட் காலாவதியானது — எங்களுடன் பயணித்ததற்கு நன்றி.",
    rateYourTrip: "பயணத்தை மதிப்பிடுங்கள்",
    rateAndFeedback: "மதிப்பீடு & கருத்து",
    // Grievance
    grievanceTitle: "புகார் அளிக்கவும்",
    grievanceDesc: "பிரச்சனையைத் தெரிவிக்கவும். நாங்கள் பரிசீலித்து பதிலளிப்போம்.",
    complaintType: "புகார் வகை",
    description: "விளக்கம் (விருப்பமானது)",
    descPlaceholder: "பிரச்சனையை விரிவாக விவரிக்கவும்…",
    submit: "புகாரைச் சமர்ப்பிக்கவும்",
    submitting: "சமர்ப்பிக்கப்படுகிறது…",
    grievanceSuccess: "உங்கள் புகார் பதிவு செய்யப்பட்டது. குறிப்பு எண்: ",
    grievanceFailed: "சமர்ப்பிக்க முடியவில்லை — மீண்டும் முயற்சிக்கவும்.",
    selectTrip: "சமீபத்திய பயணத்தை இணைக்கவும் (விருப்பமானது)",
    noRecentTickets: "சமீபத்திய டிக்கெட்டுகள் இல்லை",
    // Nav
    home: "முகப்பு",
    tickets: "டிக்கெட்டுகள்",
    grievance: "புகார்",
    // Offline
    offline: "இணைய இணைப்பு இல்லை — மீண்டும் இணையும் வரை நேரலை கண்காணிப்பு கிடைக்காது.",
    // Common
    back: "பின்செல்",
    retry: "மீண்டும் முயற்சி",
    loading: "ஏற்றப்படுகிறது…",
    connecting: "இணைக்க முடியவில்லை",
    settingUp: "அமர்வு அமைக்கப்படுகிறது…",
    // Complaint types
    cleanliness: "தூய்மை",
    driverBehavior: "ஓட்டுநர் நடத்தை",
    overcrowding: "கூட்ட நெரிசல்",
    safety: "பாதுகாப்பு",
    overcharging: "கூடுதல் கட்டணம்",
    other: "மற்றவை",
    // Rating
    excellent: "மிக நன்று",
    good: "நன்று",
    average: "சுமார்",
    poor: "மோசம்",
    terrible: "மிக மோசம்",
    ratingSubmitted: "உங்கள் கருத்துக்கு நன்றி!",
    ratingFailed: "மதிப்பீட்டை சேமிக்க முடியவில்லை — மீண்டும் முயற்சிக்கவும்.",
    skipRating: "தவிர்",
    submitRating: "மதிப்பீட்டை சமர்பிக்க",
  },
} as const;

export type StringKey = keyof typeof strings.en;

// Comprehensive Passenger transit dictionary
export const passengerDictionary: Record<string, string> = {
  // Brand & Identity
  "NIGAZHTHISAI": "நிகழ்த்திசை",
  "Nigazhthisai": "நிகழ்த்திசை",
  "SMART BUS TRANSIT": "ஸ்மார்ட் பேருந்து போக்குவரத்து",
  "Where are you headed?": "எங்கே போக வேண்டும்?",
  "Tickets saved to this device": "இந்த சாதனத்தில் டிக்கெட்டுகள் சேமிக்கப்பட்டன",
  "Search Buses": "பேருந்துகளைத் தேடுக",
  "Search buses": "பேருந்துகளைத் தேடுக",
  "Select a route": "வழித்தடத்தைத் தேர்ந்தெடுக்கவும்",
  "Select origin": "புறப்படும் இடத்தை தேர்ந்தெடுக்கவும்",
  "Select destination": "சேருமிடத்தைத் தேர்ந்தெடுக்கவும்",
  "Select a route first": "முதலில் வழித்தடத்தைத் தேர்ந்தெடுக்கவும்",
  "Nearest stop": "அருகிலுள்ள நிறுத்தம்",
  "Select Bus": "பேருந்தைத் தேர்ந்தெடுக்கவும்",
  "Bus Occupancy": "பேருந்து நிரம்பல் நிலை",
  "SEATS FILLED": "இருக்கைகள் நிரம்பின",
  "Seats Filled": "இருக்கைகள் நிரம்பின",
  "Price per seat": "ஒரு இருக்கைக்கான கட்டணம்",
  "Price per seat:": "ஒரு இருக்கைக்கான கட்டணம்:",
  "Track": "கண்காணி",
  "Book Now": "முன்பதிவு செய்",
  "Full": "நிரம்பியது",
  "Currently near": "தற்போது அருகில்",
  "En route": "வழியில் உள்ளது",
  "Accessible": "அணுகக்கூடியது",
  "Direct": "நேரடி",
  "Checkout": "கட்டணம் செலுத்துதல்",
  "Number of passengers": "பயணிகள் எண்ணிக்கை",
  "Concession Type": "சலுகை வகை",
  "Total fare": "மொத்த கட்டணம்",
  "Total fare:": "மொத்த கட்டணம்:",
  "Paying to:": "செலுத்தப்படும் நிறுவனம்:",
  "Pay": "செலுத்து",
  "Processing payment…": "கட்டணம் செயலாக்கப்படுகிறது…",
  "Issuing ticket…": "டிக்கெட் வழங்கப்படுகிறது…",
  "Payment received": "கட்டணம் பெறப்பட்டது",
  "Payment failed": "கட்டணம் தோல்வியடைந்தது",
  "My Tickets": "எனது டிக்கெட்டுகள்",
  "Tickets bought on this device.": "இந்த சாதனத்தில் வாங்கப்பட்ட டிக்கெட்டுகள்.",
  "Report an Issue": "புகார் அளிக்கவும்",
  "Report": "புகார்",
  "Home": "முகப்பு",
  "Back": "பின்செல்",
  "Retry": "மீண்டும் முயற்சி",
  "Loading…": "ஏற்றப்படுகிறது…",
  "Route": "வழித்தடம்",
  "From": "இருந்து",
  "To": "வரை",
  "Via": "வழியாக",
  "ETA": "வருகை நேரம்",
  "Arrival": "வருகை",
  "Departure": "புறப்பாடு",
  "Passenger": "பயணி",
  "Passengers": "பயணிகள்",
  "Ticket validated": "டிக்கெட் சரிபார்க்கப்பட்டது",
  "Trip complete": "பயணம் முடிவடைந்தது",
  "Rate Your Trip": "பயணத்தை மதிப்பிடுங்கள்",
  "Rate & Feedback": "மதிப்பீடு & கருத்து",
  "Normal": "சாதாரண",
  "Student (50% off)": "மாணவர் (50% சலுகை)",
  "Senior Citizen (50% off)": "மூத்த குடிமக்கள் (50% சலுகை)",
  "Monthly Commuter Pass": "மாதாந்திர பாஸ்",
  "Freedom Fighter (Free)": "தியாகிகள் (இலவசம்)",

  // Transit Stops & Corridors
  "Railway Station North": "ரயில் நிலையம் வடக்கு",
  "Medical College Junction": "மருத்துவக் கல்லூரி சந்திப்பு",
  "Vallam Road Market": "வல்லம் சாலை சந்தை",
  "Karanthai Signal": "கரந்தை சிக்னல்",
  "Thanjavur New Bus Stand to Thanjavur Old Bus Stand": "தஞ்சாவூர் புதிய பேருந்து நிலையம் முதல் தஞ்சாவூர் பழைய பேருந்து நிலையம் வரை",
  "Thanjavur New Bus Stand": "தஞ்சாவூர் புதிய பேருந்து நிலையம்",
  "Thanjavur Old Bus Stand": "தஞ்சாவூர் பழைய பேருந்து நிலையம்",
  "Railway Station": "ரயில் நிலையம்",
  "Bus Stand": "பேருந்து நிலையம்",
  "New Bus Stand": "புதிய பேருந்து நிலையம்",
  "Old Bus Stand": "பழைய பேருந்து நிலையம்",
  "Medical College": "மருத்துவக் கல்லூரி",
  "Vallam Road": "வல்லம் சாலை",
  "Thanjavur": "தஞ்சாவூர்",
  "Karanthai": "கரந்தை",
  "Vallam": "வல்லம்",
};

// Reverse dictionary
export const reverseDictionary: Record<string, string> = {};
for (const [en, ta] of Object.entries(passengerDictionary)) {
  if (!reverseDictionary[ta]) {
    reverseDictionary[ta] = en;
  }
}
// Also reverse legacy string values
for (const [key, val] of Object.entries(strings.ta)) {
  const enVal = strings.en[key as StringKey];
  if (enVal && !reverseDictionary[val]) {
    reverseDictionary[val] = enVal;
  }
}

const lowerDictMap = new Map<string, string>();
for (const [en, ta] of Object.entries(passengerDictionary)) {
  lowerDictMap.set(en.toLowerCase(), ta);
}

// Dynamic Translation Memory
const translationMemory = new Map<string, string>();

export function recordTranslation(en: string, ta: string) {
  if (en && ta && en !== ta) {
    translationMemory.set(ta, en);
    translationMemory.set(ta.trim(), en.trim());
  }
}

// Dynamic patterns for parameterized passenger strings
const dynamicPatterns: Array<{ regex: RegExp; replace: (match: RegExpMatchArray) => string }> = [
  {
    regex: /^(\d+)\s+buses?\s+available$/i,
    replace: (m) => `${m[1]} பேருந்துகள் உள்ளன`,
  },
  {
    regex: /^(\d+)\s+seats?\s+filled$/i,
    replace: (m) => `${m[1]} இருக்கைகள் நிரம்பின`,
  },
  {
    regex: /^(\d+)\s+passengers?$/i,
    replace: (m) => `${m[1]} பயணிகள்`,
  },
  {
    regex: /^(\d+)\s+m\s+away/i,
    replace: (m) => `${m[1]} மீ தூரத்தில்`,
  },
  {
    regex: /^Route ([A-Za-z0-9-_]+)$/i,
    replace: (m) => `வழித்தடம் ${m[1]}`,
  },
  {
    regex: /^ETA:\s*(.*)$/i,
    replace: (m) => `வருகை நேரம்: ${m[1]}`,
  },
  {
    regex: /^₹\s*(\d+(?:\.\d+)?)$/i,
    replace: (m) => `₹${m[1]}`,
  },
];

const reversePatterns: Array<{ regex: RegExp; replace: (match: RegExpMatchArray) => string }> = [
  {
    regex: /^(\d+)\s+பேருந்துகள்\s+உள்ளன$/i,
    replace: (m) => `${m[1]} buses available`,
  },
  {
    regex: /^(\d+)\s+இருக்கைகள்\s+நிரம்பின$/i,
    replace: (m) => `${m[1]} seats filled`,
  },
  {
    regex: /^(\d+)\s+பயணிகள்$/i,
    replace: (m) => `${m[1]} passengers`,
  },
  {
    regex: /^(\d+)\s+மீ\s+தூரத்தில்/i,
    replace: (m) => `${m[1]} m away`,
  },
  {
    regex: /^வழித்தடம்\s+([A-Za-z0-9-_]+)$/i,
    replace: (m) => `Route ${m[1]}`,
  },
];

const sortedEntries = Object.entries(passengerDictionary).sort(
  (a, b) => b[0].length - a[0].length
);

const sortedReverseEntries = Object.entries(reverseDictionary).sort(
  (a, b) => b[0].length - a[0].length
);

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Phonetic Transliteration Engine
const baseConsonantMap: Record<string, string> = {
  k: "க", g: "க", kh: "க", gh: "க", ng: "ங",
  ch: "ச", c: "ச", s: "ஸ", sh: "ஷ", j: "ஜ", z: "ஸ",
  th: "த", dh: "த", d: "ட", t: "ட",
  n: "ன", nn: "ண",
  p: "ப", b: "ப", f: "ப", m: "ம",
  y: "ய", r: "ர", l: "ல", ll: "ள",
  v: "வ", w: "வ", zh: "ழ்", h: "ஹ"
};

const consonantPulliMap: Record<string, string> = {
  k: "க்", g: "க்", kh: "க்", gh: "க்", ng: "ங்",
  ch: "ச்", c: "ச்", s: "ஸ்", sh: "ஷ்", j: "ஜ்", z: "ஸ்",
  th: "த்", dh: "த்", d: "ட்", t: "ட்",
  n: "ன்", nn: "ண்",
  p: "ப்", b: "ப்", f: "ப்", m: "ம்",
  y: "ய்", r: "ர்", l: "ல்", ll: "ள்",
  v: "வ்", w: "வ்", zh: "ழ்", h: "ஹ"
};

const vowelSignMap: Record<string, string> = {
  aa: "ா", a: "", ee: "ீ", ii: "ீ", i: "ி",
  oo: "ூ", uu: "ூ", u: "ு", ae: "ே", ai: "ை",
  ea: "ே", e: "ெ", oa: "ோ", o: "ொ", au: "ௌ"
};

const vowelInitialMap: Record<string, string> = {
  aa: "ஆ", a: "அ", ee: "ஈ", ii: "ஈ", i: "இ",
  oo: "ஊ", uu: "ஊ", u: "உ", ae: "ஏ", ai: "ஐ",
  ea: "ஏ", e: "எ", oa: "ஓ", o: "ஒ", au: "ஔ"
};

export function transliterateWord(word: string): string {
  if (/^[A-Z0-9\-_]+$/i.test(word) && /\d/.test(word)) return word;
  if (/^[0-9.,:;!?%₹#\(\)\-_/\\+=*&^$@]+$/.test(word)) return word;

  const str = word.toLowerCase();
  let result = "";
  let i = 0;

  while (i < str.length) {
    let c: string | null = null;
    let cLen = 0;

    if (i + 1 < str.length) {
      const sub2 = str.slice(i, i + 2);
      if (baseConsonantMap[sub2]) {
        c = sub2;
        cLen = 2;
      }
    }
    const char = str[i] ?? "";
    if (!c && char && baseConsonantMap[char]) {
      c = char;
      cLen = 1;
    }

    if (c) {
      i += cLen;
      let v: string | null = null;
      let vLen = 0;
      if (i + 1 < str.length) {
        const vSub2 = str.slice(i, i + 2);
        if (vowelSignMap[vSub2] !== undefined) {
          v = vSub2;
          vLen = 2;
        }
      }
      const vChar = str[i] ?? "";
      if (!v && vChar && vowelSignMap[vChar] !== undefined) {
        v = vChar;
        vLen = 1;
      }

      const baseC = baseConsonantMap[c];
      const signV = v !== null ? vowelSignMap[v] : undefined;
      if (baseC && signV !== undefined) {
        result += baseC + signV;
        i += vLen;
      } else {
        result += consonantPulliMap[c] || baseC || "";
      }
    } else {
      let v: string | null = null;
      let vLen = 0;
      if (i + 1 < str.length) {
        const vSub2 = str.slice(i, i + 2);
        if (vowelInitialMap[vSub2]) {
          v = vSub2;
          vLen = 2;
        }
      }
      const vInitChar = str[i] ?? "";
      if (!v && vInitChar && vowelInitialMap[vInitChar]) {
        v = vInitChar;
        vLen = 1;
      }

      if (v && vowelInitialMap[v]) {
        result += vowelInitialMap[v];
        i += vLen;
      } else {
        result += str[i] ?? "";
        i++;
      }
    }
  }

  if (result && result !== word) {
    recordTranslation(word, result);
  }

  return result;
}

// Auto-Translation Engine
export function translateText(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return rawText;

  if (passengerDictionary[trimmed]) {
    const res = passengerDictionary[trimmed]!;
    recordTranslation(trimmed, res);
    return rawText.replace(trimmed, res);
  }

  const lowerTrimmed = trimmed.toLowerCase();
  if (lowerDictMap.has(lowerTrimmed)) {
    const res = lowerDictMap.get(lowerTrimmed)!;
    recordTranslation(trimmed, res);
    return rawText.replace(trimmed, res);
  }

  for (const p of dynamicPatterns) {
    const match = trimmed.match(p.regex);
    if (match) {
      const res = p.replace(match);
      recordTranslation(trimmed, res);
      return rawText.replace(trimmed, res);
    }
  }

  const viaMatch = trimmed.match(/^(.*?)\s+to\s+(.*?)\s+via\s+(.*)$/i);
  if (viaMatch) {
    const orig = translateText(viaMatch[1]!.trim());
    const dest = translateText(viaMatch[2]!.trim());
    const via = translateText(viaMatch[3]!.trim());
    const res = `${via} வழியாக ${orig} முதல் ${dest} வரை`;
    recordTranslation(trimmed, res);
    return rawText.replace(trimmed, res);
  }

  const toMatch = trimmed.match(/^(.*?)\s+(?:to|→)\s+(.*)$/i);
  if (toMatch) {
    const orig = translateText(toMatch[1]!.trim());
    const dest = translateText(toMatch[2]!.trim());
    const res = `${orig} முதல் ${dest} வரை`;
    recordTranslation(trimmed, res);
    return rawText.replace(trimmed, res);
  }

// English sentence indicators (articles, prepositions, aux verbs, pronouns)
const englishSentenceWords = new Set([
  "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did",
  "a", "an", "and", "or", "but", "nor", "for", "yet", "so",
  "at", "by", "from", "in", "into", "of", "off", "on", "onto", "out", "over", "to", "up", "with", "across",
  "about", "against", "between", "through", "during", "before", "after", "above", "below",
  "this", "that", "these", "those", "my", "your", "his", "her", "its", "our", "their",
  "what", "which", "who", "whom", "whose", "where", "when", "why", "how",
  "all", "any", "both", "each", "few", "more", "most", "other", "some", "such",
  "no", "not", "only", "own", "same", "than", "too", "very", "can", "will", "just",
  "should", "now", "cannot", "could", "would", "please"
]);

// Landmark words common in dynamic stop and station names
const landmarkReplacements: Array<[RegExp, string]> = [
  [/\bBus Stand\b/gi, "பேருந்து நிலையம்"],
  [/\bBus Stop\b/gi, "பேருந்து நிறுத்தம்"],
  [/\bRailway Station\b/gi, "ரயில் நிலையம்"],
  [/\bJunction\b/gi, "சந்திப்பு"],
  [/\bCheckpost\b/gi, "செக்போஸ்ட்"],
  [/\bHospital\b/gi, "மருத்துவமனை"],
  [/\bCollege\b/gi, "கல்லூரி"],
  [/\bSchool\b/gi, "பள்ளி"],
  [/\bTemple\b/gi, "கோவில்"],
  [/\bRoad\b/gi, "சாலை"],
  [/\bStreet\b/gi, "தெரு"],
  [/\bNagar\b/gi, "நகர்"],
  [/\bCross\b/gi, "குறுக்குத்தெரு"],
  [/\bNorth\b/gi, "வடக்கு"],
  [/\bSouth\b/gi, "தெற்கு"],
  [/\bEast\b/gi, "கிழக்கு"],
  [/\bWest\b/gi, "மேற்கு"],
];

function isEnglishSentence(text: string): boolean {
  const tokens = text.toLowerCase().split(/[^a-z]+/);
  let sentenceWordCount = 0;
  for (const t of tokens) {
    if (englishSentenceWords.has(t)) {
      sentenceWordCount++;
    }
  }
  return sentenceWordCount >= 2 || (tokens.length >= 4 && sentenceWordCount >= 1);
}

  let result = rawText;
  let changed = false;

  for (const entry of sortedEntries) {
    const key = entry[0];
    const val = entry[1];
    if (key.length >= 2) {
      const isAlphaNum = /^[A-Za-z0-9\s]+$/.test(key);
      const pattern = isAlphaNum ? `\\b${escapeRegex(key)}\\b` : escapeRegex(key);
      try {
        const re = new RegExp(pattern, "gi");
        if (re.test(result)) {
          result = result.replace(re, val);
          changed = true;
        }
      } catch {
        if (result.includes(key)) {
          result = result.split(key).join(val);
          changed = true;
        }
      }
    }
  }

  // Dynamic Landmark Suffixes for changing stop names
  for (const [re, val] of landmarkReplacements) {
    if (re.test(result)) {
      result = result.replace(re, val);
      changed = true;
    }
  }

  // Auto-Translation strictly for CHANGING THINGS (New Stops, Routes, and User Names)
  if (/[a-zA-Z]{2,}/.test(result) && !isEnglishSentence(trimmed)) {
    result = result.replace(/\b[a-zA-Z]{2,}\b/g, (token) => {
      if (/^[A-Z0-9\-_]+$/i.test(token) && /\d/.test(token)) return token;
      const lower = token.toLowerCase();
      if (lowerDictMap.has(lower)) {
        return lowerDictMap.get(lower)!;
      }
      const transliterated = transliterateWord(token);
      if (transliterated && transliterated !== token) {
        recordTranslation(token, transliterated);
        return transliterated;
      }
      return token;
    });
    changed = true;
  }

  if (changed) {
    recordTranslation(trimmed, result.trim());
    return result;
  }

  return rawText;
}

// Clean English Reversion
export function revertToEnglish(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return rawText;
  if (!/[\u0B80-\u0BFF]/.test(trimmed)) return rawText;

  if (translationMemory.has(trimmed)) {
    return rawText.replace(trimmed, translationMemory.get(trimmed)!);
  }

  if (reverseDictionary[trimmed]) {
    return rawText.replace(trimmed, reverseDictionary[trimmed]!);
  }

  for (const p of reversePatterns) {
    const match = trimmed.match(p.regex);
    if (match) {
      return rawText.replace(trimmed, p.replace(match));
    }
  }

  let result = rawText;
  for (const [ta, en] of sortedReverseEntries) {
    if (ta.length >= 2 && result.includes(ta)) {
      result = result.split(ta).join(en);
    }
  }

  if (/[\u0B80-\u0BFF]/.test(result)) {
    result = result.replace(/[\u0B80-\u0BFF]+/g, (taToken) => {
      if (translationMemory.has(taToken)) {
        return translationMemory.get(taToken)!;
      }
      if (reverseDictionary[taToken]) {
        return reverseDictionary[taToken]!;
      }
      return taToken;
    });
  }

  return result;
}

interface I18nContextType {
  lang: Language;
  setLang: (l: Language) => void;
  t: (keyOrText: StringKey | string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);
const origEnWeakMap = new WeakMap<Node, string>();

export function I18nProvider({ children }: { children: ReactNode }) {
  const stored = (localStorage.getItem(STORAGE_KEY) ?? "en") as Language;
  const [lang, setLangState] = useState<Language>(stored === "ta" ? "ta" : "en");

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (keyOrText: StringKey | string, fallback?: string): string => {
      // 1. If key exists in static dictionary
      if (strings[lang] && (strings[lang] as any)[keyOrText]) {
        return (strings[lang] as any)[keyOrText];
      }
      if (lang === "en") return fallback || keyOrText;
      return translateText(keyOrText) || fallback || keyOrText;
    },
    [lang],
  );

  // Automatic DOM Translator for Passenger PWA
  useEffect(() => {
    let isTranslating = false;
    const hasTamil = (s: string) => /[\u0B80-\u0BFF]/.test(s);

    const handleNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        if (lang === "ta") {
          if (!hasTamil(node.nodeValue)) {
            origEnWeakMap.set(node, node.nodeValue);
            (node as any).__origEn = node.nodeValue;
          } else if ((node as any).__origEn && hasTamil((node as any).__origEn)) {
            delete (node as any).__origEn;
          }

          const original = origEnWeakMap.get(node) || (node as any).__origEn || node.nodeValue;
          const translated = translateText(original);
          if (translated !== node.nodeValue) {
            node.nodeValue = translated;
          }
        } else {
          const orig = origEnWeakMap.get(node) || (node as any).__origEn;
          if (orig && !hasTamil(orig)) {
            node.nodeValue = orig;
          } else if (hasTamil(node.nodeValue)) {
            node.nodeValue = revertToEnglish(node.nodeValue);
          }
          delete (node as any).__origEn;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "CODE" || el.tagName === "PRE") {
          return;
        }

        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          if (lang === "ta") {
            if (el.placeholder) {
              if (!hasTamil(el.placeholder)) {
                (el as any).__origPlaceholder = el.placeholder;
              }
              const orig = (el as any).__origPlaceholder || el.placeholder;
              const translated = translateText(orig);
              if (translated !== el.placeholder) {
                el.placeholder = translated;
              }
            }
          } else {
            if ((el as any).__origPlaceholder && !hasTamil((el as any).__origPlaceholder)) {
              el.placeholder = (el as any).__origPlaceholder;
            } else if (hasTamil(el.placeholder)) {
              el.placeholder = revertToEnglish(el.placeholder);
            }
            delete (el as any).__origPlaceholder;
          }
        }

        if (el.title) {
          if (lang === "ta") {
            if (!hasTamil(el.title)) {
              (el as any).__origTitle = el.title;
            }
            const orig = (el as any).__origTitle || el.title;
            const translated = translateText(orig);
            if (translated !== el.title) {
              el.title = translated;
            }
          } else {
            if ((el as any).__origTitle && !hasTamil((el as any).__origTitle)) {
              el.title = (el as any).__origTitle;
            } else if (hasTamil(el.title)) {
              el.title = revertToEnglish(el.title);
            }
            delete (el as any).__origTitle;
          }
        }

        node.childNodes.forEach(handleNode);
      }
    };

    isTranslating = true;
    handleNode(document.body);
    isTranslating = false;

    const observer = new MutationObserver((mutations) => {
      if (isTranslating) return;
      isTranslating = true;
      try {
        mutations.forEach((mutation) => {
          if (mutation.type === "childList") {
            mutation.addedNodes.forEach(handleNode);
          } else if (mutation.type === "characterData" && mutation.target) {
            handleNode(mutation.target);
          }
        });
      } finally {
        isTranslating = false;
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
    };
  }, [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
