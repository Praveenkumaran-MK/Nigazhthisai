/**
 * Minimal bilingual helper for the Passenger PWA.
 * Supports English (en) and Tamil (ta).
 * Language preference is persisted to localStorage.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Language = "en" | "ta";

const STORAGE_KEY = "ngz_lang";

const strings = {
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
    accessible: "♿ Accessible",
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
    whereHeaded: "நீங்கள் எங்கே செல்கிறீர்கள்?",
    ticketsSavedDevice: "டிக்கெட்டுகள் இந்த சாதனத்தில் சேமிக்கப்படும்",
    route: "வழித்தடம்",
    from: "புறப்படும் நிறுத்தம்",
    to: "வரும் நிறுத்தம்",
    selectRoute: "வழித்தடம் தேர்வு செய்க",
    selectOrigin: "புறப்படும் நிறுத்தம் தேர்வு செய்க",
    selectDest: "வரும் நிறுத்தம் தேர்வு செய்க",
    selectRouteFirst: "முதலில் வழித்தடம் தேர்வு செய்க",
    searchBuses: "பேருந்துகள் தேடு",
    locatingYou: "உங்கள் இடத்தை கண்டறிகிறோம்…",
    locationUseNote: "நெருங்கிய நிறுத்தத்தை பரிந்துரைக்க மட்டுமே உங்கள் இருப்பிடம் பயன்படுத்தப்படுகிறது.",
    locationDenied: "இருப்பிட அனுமதி மறுக்கப்பட்டது. மேலே கைமுறையாக நிறுத்தங்களை தேர்வு செய்க.",
    locationUnavailable: "உங்கள் இருப்பிடத்தை கண்டறிய முடியவில்லை. மேலே கைமுறையாக தேர்வு செய்க.",
    nearestStop: "அருகிலுள்ள நிறுத்தம்",
    nearestStopAway: "மீ தூரத்தில் — மேலே வழித்தடம் தேர்வு செய்யுங்கள்.",
    serviceAlert: "சேவை அறிவிப்பு",
    selectBus: "பேருந்து தேர்வு செய்க",
    busesAvailable: "பேருந்துகள் கிடைக்கின்றன",
    busAvailable: "பேருந்து கிடைக்கிறது",
    searching: "தேடுகிறோம்…",
    noBusesAvailable: "இப்போது பேருந்துகள் இல்லை",
    noBusesDesc: "இந்த வழித்தடத்தில் உள்ள அனைத்து பேருந்துகளும் உங்கள் நிறுத்தத்தை கடந்துவிட்டன அல்லது சேவையில் இல்லை. சற்று நேரம் கழித்து முயற்சிக்கவும்.",
    busOccupancy: "பேருந்து நிரம்பளவு",
    seatsFilled: "இருக்கைகள் நிரம்பியுள்ளன",
    pricePerSeat: "இருக்கை விலை",
    track: "கண்காணி",
    bookNow: "இப்போது பதிவு செய்க",
    full: "நிரம்பியது",
    currentlyNear: "தற்போது அருகில்",
    enRoute: "வழியில்",
    accessible: "♿ அணுகல் வசதி",
    direct: "நேரடி",
    checkout: "கட்டண படிவம்",
    numberOfPassengers: "பயணிகள் எண்ணிக்கை",
    concessionType: "சலுகை வகை",
    totalFare: "மொத்த கட்டணம்",
    payingTo: "யாருக்கு செலுத்துகிறோம்:",
    payButton: "செலுத்து",
    processingPayment: "கட்டணம் செயலாக்கப்படுகிறது…",
    issuingTicket: "டிக்கெட் வழங்கப்படுகிறது…",
    paymentReceived: "கட்டணம் பெறப்பட்டது",
    paymentFailed: "கட்டணம் தோல்வியடைந்தது",
    paymentsUnavailable: "டிக்கெட் கொள்முதல் இப்போது கிடைக்கவில்லை. பின்னர் முயற்சிக்கவும்.",
    loadingPayment: "கட்டண கட்டமைப்பு ஏற்றப்படுகிறது — சற்று நேரம் கழித்து முயற்சிக்கவும்.",
    concNormal: "சாதாரண",
    concStudent: "மாணவர் (50% தள்ளுபடி)",
    concSenior: "மூத்த குடிமகன் (50% தள்ளுபடி)",
    concMonthlyPass: "மாதாந்திர பயணச்சீட்டு",
    concFreedomFighter: "சுதந்திர போராளி (இலவசம்)",
    myTickets: "என் டிக்கெட்டுகள்",
    ticketsOnDevice: "இந்த சாதனத்தில் வாங்கிய டிக்கெட்டுகள்.",
    loadingTickets: "உங்கள் டிக்கெட்டுகள் ஏற்றப்படுகின்றன…",
    noTicketsYet: "டிக்கெட்டுகள் இல்லை",
    noTicketsDesc: "நீங்கள் வாங்கும் டிக்கெட்டுகள் இங்கே காட்டப்படும் — இவை உலாவியுடன் இணைக்கப்பட்டுள்ளன.",
    passengers: "பயணிகள்",
    passenger: "பயணி",
    loadingTicket: "டிக்கெட் ஏற்றப்படுகிறது…",
    approachingDest: "உங்கள் இலக்கை அணுகுகிறீர்கள்",
    approachingDesc1: "இறங்கியதை சரிபார்க்க நினைவூட்டல் அனுப்பப்பட்டது.",
    approachingDesc2: "நீங்கள் உங்கள் நிறுத்தத்திற்கு அருகில் இருக்கிறீர்கள்.",
    ticketValidated: "டிக்கெட் சரிபார்க்கப்பட்டது",
    ticketValidatedDesc: "உங்கள் டிக்கெட் நடத்துநரால் ஸ்கேன் செய்யப்பட்டது. பயணத்தை ரசியுங்கள்!",
    tripComplete: "பயணம் முடிந்தது",
    tripCompleteDesc: "இந்த டிக்கெட் காலாவதியாகிவிட்டது — எங்களுடன் பயணித்தமைக்கு நன்றி.",
    rateYourTrip: "உங்கள் பயணத்தை மதிப்பிடுங்கள்",
    rateAndFeedback: "மதிப்பீடு & கருத்து",
    grievanceTitle: "புகாரை பதிவு செய்க",
    grievanceDesc: "என்ன தவறு நடந்தது என்று சொல்லுங்கள். நாங்கள் ஆராய்ந்து பதிலளிப்போம்.",
    complaintType: "புகார் வகை",
    description: "விளக்கம் (விரும்பினால்)",
    descPlaceholder: "சிக்கலை விரிவாக விவரிக்கவும்…",
    submit: "புகாரை சமர்பிக்க",
    submitting: "சமர்பிக்கப்படுகிறது…",
    grievanceSuccess: "உங்கள் புகார் சமர்பிக்கப்பட்டது. குறிப்பு: ",
    grievanceFailed: "சமர்பிக்க முடியவில்லை — மீண்டும் முயற்சிக்கவும்.",
    selectTrip: "சமீபத்திய பயணத்துடன் இணை (விரும்பினால்)",
    noRecentTickets: "சமீபத்திய டிக்கெட்டுகள் இல்லை",
    home: "முகப்பு",
    tickets: "என் டிக்கெட்",
    grievance: "புகார்",
    offline: "நீங்கள் ஆஃப்லைனில் இருக்கிறீர்கள் — மீண்டும் இணைக்கும் வரை நேரடி கண்காணிப்பும் டிக்கெட் கொள்முதலும் கிடைக்காது.",
    back: "பின்",
    retry: "மீண்டும் முயற்சி",
    loading: "ஏற்றுகிறோம்…",
    connecting: "இணைக்க முடியவில்லை",
    settingUp: "உங்கள் அமர்வை அமைக்கிறோம்…",
    cleanliness: "தூய்மை",
    driverBehavior: "ஓட்டுநர் நடத்தை",
    overcrowding: "அதிக கூட்டம்",
    safety: "பாதுகாப்பு",
    overcharging: "அதிகமாக வசூலித்தல்",
    other: "மற்றவை",
    excellent: "சிறந்தது",
    good: "நல்லது",
    average: "சராசரி",
    poor: "மோசம்",
    terrible: "மிகவும் மோசம்",
    ratingSubmitted: "உங்கள் கருத்துக்கு நன்றி!",
    ratingFailed: "மதிப்பீட்டை சேமிக்க முடியவில்லை — மீண்டும் முயற்சிக்கவும்.",
    skipRating: "தவிர்",
    submitRating: "மதிப்பீட்டை சமர்பிக்க",
  },
} as const;

export type StringKey = keyof typeof strings.en;

interface I18nContextType {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: StringKey) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const stored = (localStorage.getItem(STORAGE_KEY) ?? "en") as Language;
  const [lang, setLangState] = useState<Language>(stored === "ta" ? "ta" : "en");

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key: StringKey): string => strings[lang][key] as string,
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
