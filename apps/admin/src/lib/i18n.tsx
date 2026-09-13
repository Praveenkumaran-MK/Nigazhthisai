import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type Language = "en" | "ta";

const STORAGE_KEY = "ngz_admin_lang";

// Comprehensive English-to-Tamil dictionary covering navigation, headers, tables, forms, filters, and actions
export const dictionary: Record<string, string> = {
  // Brand & Portal Titles
  "NIGAZHTHISAI": "நிகழ்த்திசை",
  "Nigazhthisai": "நிகழ்த்திசை",
  "MASTER ADMIN": "முதன்மை நிர்வாகி",
  "DISTRICT ADMIN": "மாவட்ட நிர்வாகி",
  "MASTER": "முதன்மை",
  "ADMIN": "நிர்வாகம்",
  "CONDUCTOR": "நடத்துனர்",
  "PASSENGER": "பயணி",
  "MANAGEMENT PORTAL": "நிர்வாக தளம்",
  "BACK": "பின்செல்",
  "Back": "பின்செல்",
  "LOGOUT": "வெளியேறு",
  "Sign out": "வெளியேறு",
  "SIGN IN": "உள்நுழைக",
  "SIGNING IN…": "உள்நுழைகிறது…",
  "FORGOT PASSWORD? CONTACT ADMINISTRATOR": "கடவுச்சொல் மறந்துவிட்டதா? நிர்வாகியைத் தொடர்பு கொள்ளவும்",

  // Navigation Groups
  "Operations": "செயல்பாடுகள்",
  "OPERATIONS": "செயல்பாடுகள்",
  "Monitoring": "கண்காணிப்பு",
  "MONITORING": "கண்காணிப்பு",
  "Finance": "நிதி மேலாண்மை",
  "FINANCE": "நிதி மேலாண்மை",
  "Maintenance": "பராமரிப்பு",
  "System Control": "முதன்மை கட்டுப்பாடு",
  "SYSTEM CONTROL": "முதன்மை கட்டுப்பாடு",
  "Master Control": "முதன்மை கட்டுப்பாடு",
  "MASTER CONTROL": "முதன்மை கட்டுப்பாடு",

  // Navigation Links
  "Dashboard": "கட்டுப்பாட்டகம்",
  "DASHBOARD": "கட்டுப்பாட்டகம்",
  "Overview": "கட்டுப்பாட்டகம்",
  "Live Monitoring": "நேரலை கண்காணிப்பு",
  "Live Pipeline Tracking": "நேரலை பைப்லைன் கண்காணிப்பு",
  "Idle & Alerts": "செயலற்ற & எச்சரிக்கைகள்",
  "Operational Alerts": "செயல்பாட்டு எச்சரிக்கைகள்",
  "Stops": "நிறுத்தங்கள்",
  "STOPS": "நிறுத்தங்கள்",
  "Routes": "வழித்தடங்கள்",
  "ROUTES": "வழித்தடங்கள்",
  "Route Stops": "வழித்தட நிறுத்தங்கள்",
  "ROUTE STOPS": "வழித்தட நிறுத்தங்கள்",
  "Buses & ETM": "பேருந்துகள் & இடிஎம்",
  "Buses": "பேருந்துகள்",
  "BUSES": "பேருந்துகள்",
  "Trips & Schedules": "பயணங்கள் & அட்டவணைகள்",
  "Trips": "பயணங்கள்",
  "TRIPS": "பயணங்கள்",
  "Schedules Matrix": "அட்டவணை மேட்ரிக்ஸ்",
  "Schedules": "கால அட்டவணைகள்",
  "SCHEDULES": "கால அட்டவணைகள்",
  "Tickets & Revenue": "டிக்கெட்டுகள் & வருவாய்",
  "Revenue Analytics": "வருவாய் பகுப்பாய்வு",
  "Revenue": "வருவாய்",
  "REVENUE": "வருவாய்",
  "Fares Matrix": "கட்டண மேட்ரிக்ஸ்",
  "Fares": "கட்டணங்கள்",
  "FARES": "கட்டணங்கள்",
  "Conductors Directory": "நடத்துனர்கள் பட்டியல்",
  "Conductors": "நடத்துனர்கள்",
  "CONDUCTORS": "நடத்துனர்கள்",
  "Complaints & Grievance": "புகார்கள் & குறைதீர்ப்பு",
  "Passenger Complaints": "பயணிகள் புகார்கள்",
  "Complaints": "புகார்கள்",
  "COMPLAINTS": "புகார்கள்",
  "Fleet Maintenance": "பராமரிப்பு மேலாண்மை",
  "Fleet & ETM Maintenance": "பராமரிப்பு மேலாண்மை",
  "Fleet": "பேருந்துக் குழு",
  "FLEET": "பேருந்துக் குழு",
  "ETM Devices": "இடிஎம் சாதனங்கள்",
  "Bus QR Codes": "பேருந்து க்யூஆர்",
  "Districts": "மாவட்டங்கள்",
  "DISTRICTS": "மாவட்டங்கள்",
  "Users & Roles": "பயனர்கள் & பாத்திரங்கள்",
  "Admin Users": "நிர்வாக பயனர்கள்",
  "System Settings": "அமைப்பு அமைப்புகள்",
  "CSV Import": "சிஎஸ்வி பதிவேற்றம்",

  // Location Filter Strip
  "FILTERS": "வடிப்பான்கள்",
  "Filters": "வடிப்பான்கள்",
  "REFINE DASHBOARD DATA BY LOCATION": "இருப்பிடத்தின்படி தரவை வடிகட்டுக",
  "DISTRICT": "மாவட்டம்",
  "District": "மாவட்டம்",
  "ALL DISTRICTS": "அனைத்து மாவட்டங்கள்",
  "ALL DISTRICT": "அனைத்து மாவட்டங்கள்",
  "All Districts": "அனைத்து மாவட்டங்கள்",
  "ZONE": "மண்டலம்",
  "Zone": "மண்டலம்",
  "ALL ZONES": "அனைத்து மண்டலங்கள்",
  "ALL ZONE": "அனைத்து மண்டலங்கள்",
  "All Zones": "அனைத்து மண்டலங்கள்",
  "NORTH ZONE": "வடக்கு மண்டலம்",
  "North Zone": "வடக்கு மண்டலம்",
  "SOUTH ZONE": "தெற்கு மண்டலம்",
  "South Zone": "தெற்கு மண்டலம்",
  "CENTRAL ZONE": "மத்திய மண்டலம்",
  "Central Zone": "மத்திய மண்டலம்",
  "WEST ZONE": "மேற்கு மண்டலம்",
  "EAST ZONE": "கிழக்கு மண்டலம்",

  // Districts & Key Cities in Tamil Nadu
  "CHENNAI": "சென்னை",
  "Chennai": "சென்னை",
  "COIMBATORE": "கோயம்புத்தூர்",
  "Coimbatore": "கோயம்புத்தூர்",
  "MADURAI": "மதுரை",
  "Madurai": "மதுரை",
  "SALEM": "சேலம்",
  "Salem": "சேலம்",
  "TIRUPPUR": "திருப்பூர்",
  "Tiruppur": "திருப்பூர்",
  "Tirupur": "திருப்பூர்",
  "TRICHY": "திருச்சிராப்பள்ளி",
  "Trichy": "திருச்சிராப்பள்ளி",
  "TIRUCHIRAPPALLI": "திருச்சிராப்பள்ளி",
  "Tiruchirappalli": "திருச்சிராப்பள்ளி",
  "ERODE": "ஈரோடு",
  "Erode": "ஈரோடு",
  "VELLORE": "வேலூர்",
  "Vellore": "வேலூர்",
  "DINDIGUL": "திண்டுக்கல்",
  "Dindigul": "திண்டுக்கல்",
  "THANJAVUR": "தஞ்சாவூர்",
  "Thanjavur": "தஞ்சாவூர்",
  "TIRUNELVELI": "திருநெல்வேலி",
  "Tirunelveli": "திருநெல்வேலி",
  "KANCHIPURAM": "காஞ்சிபுரம்",
  "Kanchipuram": "காஞ்சிபுரம்",
  "CUDDALORE": "கடலூர்",
  "Cuddalore": "கடலூர்",
  "KARUR": "கரூர்",
  "Karur": "கரூர்",
  "NAGERCOIL": "நாகர்கோவில்",
  "Nagercoil": "நாகர்கோவில்",
  "HOSUR": "ஓசூர்",
  "Hosur": "ஓசூர்",
  "AVINASHI": "அவிநாசி",
  "Avinashi": "அவிநாசி",
  "GANDHIPURAM": "காந்திபுரம்",
  "Gandhipuram": "காந்திபுரம்",
  "UKKADAM": "உக்கடம்",
  "Ukkadam": "உக்கடம்",
  "SINGANALLUR": "சிங்காநல்லூர்",
  "Singanallur": "சிங்காநல்லூர்",
  "PEELAMEDU": "பீளமேடு",
  "Peelamedu": "பீளமேடு",
  "KOYAMBEDU": "கோயம்பேடு",
  "Koyambedu": "கோயம்பேடு",
  "TAMBARAM": "தாம்பரம்",
  "Tambaram": "தாம்பரம்",
  "GUINDY": "கிண்டி",
  "Guindy": "கிண்டி",
  "CENTRAL": "சென்ட்ரல்",
  "Central": "சென்ட்ரல்",
  "EGMORE": "எழும்பூர்",
  "Egmore": "எழும்பூர்",

  // 4 KPI Cards & Operational Header
  "Today's Revenue": "இன்றைய வருவாய்",
  "TODAY'S REVENUE": "இன்றைய வருவாய்",
  "Total Tickets": "மொத்த டிக்கெட்டுகள்",
  "TOTAL TICKETS": "மொத்த டிக்கெட்டுகள்",
  "Active Trips": "செயலில் உள்ள பயணங்கள்",
  "ACTIVE TRIPS": "செயலில் உள்ள பயணங்கள்",
  "Total Passengers": "மொத்த பயணிகள்",
  "TOTAL PASSENGERS": "மொத்த பயணிகள்",
  "Nigazhthisai — Executive Mission Control": "நிகழ்த்திசை — தலைமை கட்டுப்பாட்டு மையம்",
  "Real-time telemetry pulse, high-level operational highlights, and rapid access across all modules": "நேரலை தொலை அளவியல் துடிப்பு, உயர்நிலை செயல்பாட்டு சிறப்பம்சங்கள் மற்றும் அனைத்து தொகுதிகளுக்கும் விரைவான அணுகல்",
  "Operational Section Highlights": "செயல்பாட்டுப் பிரிவின் சிறப்பம்சங்கள்",
  "Real-time status snapshot · Click any module to deep-dive": "நேரலை நிலை சுருக்கம் · விரிவாகப் பார்க்க எந்த தொகுதியையும் கிளிக் செய்க",
  "Corridor Passenger Demand & Surge Intelligence": "வழித்தட பயணிகள் தேவை & கூடுதல் பேருந்து நுண்ணறிவு",
  "Automated demand aggregation from passenger bookings. Highlights peak stop density and suggests fleet adjustments.": "பயணிகள் முன்பதிவுகளிலிருந்து தானியங்கி தேவை ஒருங்கிணைப்பு. உச்ச நிறுத்த அடர்த்தியை முன்னிலைப்படுத்தி பேருந்து ஒதுக்கீட்டைப் பரிந்துரைக்கிறது.",
  "Computed Live": "நேரலையில் கணக்கிடப்பட்டது",
  "Network Coverage Points": "வலையமைப்பு பாதுகாப்பு புள்ளிகள்",
  "Total Routes": "மொத்த வழித்தடங்கள்",
  "Active in Service": "சேவையில் செயலில் உள்ளது",
  "Operating Rate": "செயல்பாட்டு விகிதம்",
  "High Reliability Status": "உயர் நம்பகத்தன்மை நிலை",
  "Districts Served": "சேவையளிக்கப்பட்ட மாவட்டங்கள்",
  "Across": "மொத்தத்தில்",
  "Available": "கிடைக்கக்கூடியவை",
  "STANDARD ROUTE ACTIVE": "நிலையான தினசரி வழித்தடம் செயலில் உள்ளது",
  "CUSTOM ROUTE ACTIVE FOR SUNDAY": "ஞாயிற்றுக்கிழமைக்கான சிறப்பு வழித்தடம் செயலில் உள்ளது",
  "ACTIVE TRANSIT STOP": "செயலில் உள்ள போக்குவரத்து நிறுத்தம்",
  "REVENUE BY ROUTE": "வழித்தட வாரியான வருவாய்",
  "BOOKING CHANNELS": "முன்பதிவு வழிகள்",
  "Mobile App": "மொபைல் செயலி",
  "ETM Device": "இடிஎம் சாதனம்",
  "APP SHARE": "செயலி பங்கு",
  "VIEW REPORT": "அறிக்கையைப் பார்க்க",

  // Actions & Buttons
  "Open Pipeline Tracker": "நேரலை பைப்லைன் திறக்க",
  "Investigate Alerts": "எச்சரிக்கைகளை ஆராய்க",
  "Inspect Live Pipeline": "நேரலை பைப்லைனை ஆய்வு செய்க",
  "Manage Routes & ETAs": "வழித்தடங்கள் & நேரங்களை நிர்வகிக்க",
  "View Trip Schedules & Logs": "பயண அட்டவணைகள் & பதிவுகளைப் பார்க்க",
  "Manage Conductors": "நடத்துனர்களை நிர்வகிக்க",
  "Manage Schedules & Fleet Allocation": "அட்டவணைகள் & பேருந்து ஒதுக்கீட்டை நிர்வகிக்க",
  "CREATE ROUTE": "வழித்தடம் உருவாக்குக",
  "New Route": "புதிய வழித்தடம்",
  "START SETUP WIZARD": "அமைவு வழிகாட்டியைத் தொடங்குக",
  "SETUP NEW BUS": "புதிய பேருந்து அமை",
  "ADD BUS": "பேருந்து சேர்க்க",
  "Add Bus": "பேருந்து சேர்க்க",
  "ADD ROUTE": "வழித்தடம் சேர்க்க",
  "Add Route": "வழித்தடம் சேர்க்க",
  "CREATE NEW STOP": "புதிய நிறுத்தம் உருவாக்குக",
  "CREATE NEW ROUTE": "புதிய வழித்தடம் உருவாக்குக",
  "CREATE NEW BUS": "புதிய பேருந்து உருவாக்குக",
  "CREATE NEW TRIP": "புதிய பயணம் உருவாக்குக",
  "Create New": "புதியது உருவாக்குக",
  "Cards": "கார்டுகள்",
  "Table": "அட்டவணை",
  "ACTIONS": "செயல்கள்",
  "Actions": "செயல்கள்",
  "Edit": "திருத்து",
  "EDIT": "திருத்து",
  "Delete": "நீக்கு",
  "DELETE": "நீக்கு",
  "Save": "சேமி",
  "SAVE": "சேமி",
  "Cancel": "ரத்து செய்",
  "CANCEL": "ரத்து செய்",
  "Submit": "சமர்ப்பி",
  "SUBMIT": "சமர்ப்பி",
  "Close": "மூடு",
  "CLOSE": "மூடு",
  "Refresh": "புதுப்பி",
  "REFRESH": "புதுப்பி",
  "Search": "தேடுக",
  "SEARCH": "தேடுக",
  "Clear": "அழி",
  "Apply": "பயன்படுத்து",
  "Confirm": "உறுதிப்படுத்து",
  "Download": "பதிவிறக்கு",
  "Upload": "பதிவேற்று",
  "Import": "இறக்குமதி",
  "Export": "ஏற்றுமதி",
  "Delete this record?": "இப்பதிவை நீக்கவா?",
  "This action cannot be undone.": "இந்த செயலை மாற்ற முடியாது.",
  "Loading...": "ஏற்றுகிறது...",
  "Loading": "ஏற்றுகிறது",
  "Loading corridors…": "வழித்தடங்கள் ஏற்றப்படுகின்றன…",

  // Input Placeholders
  "Search stops...": "நிறுத்தங்களைத் தேடுக...",
  "Search routes...": "வழித்தடங்களைத் தேடுக...",
  "Search corridors by name, code, or number...": "வழித்தடங்களைத் தேடுக...",
  "Search by Registration No or ETM ID...": "பதிவு எண் அல்லது இடிஎம் ஐடி மூலம் தேடுக...",
  "Search by Driver or Conductor name...": "ஓட்டுநர் அல்லது நடத்துனர் பெயர் மூலம் தேடுக...",
  "Filter by district...": "மாவட்டம் வாரியாக வடிகட்டுக...",
  "Enter stop name": "நிறுத்தப் பெயரை உள்ளிடுக",
  "Enter route code": "வழித்தடக் குறியீட்டை உள்ளிடுக",
  "Enter bus plate number": "பேருந்து பதிவு எண்ணை உள்ளிடுக",

  // Table Columns & Form Labels
  "STOP ID": "நிறுத்த ஐடி",
  "STOP NAME": "நிறுத்தப் பெயர்",
  "COORDINATES (LAT, LNG)": "புவியியல் ஆயங்கள் (அட்சம், தீர்க்கம்)",
  "ROUTE ID": "வழித்தட ஐடி",
  "ROUTE NAME": "வழித்தடப் பெயர்",
  "CODE": "குறியீடு",
  "DYNAMIC SCHEDULE": "இயங்கு அட்டவணை",
  "STATUS": "நிலை",
  "Status": "நிலை",
  "VIEW SCHEDULE": "அட்டவணையைப் பார்க்க",
  "BUS INFO": "பேருந்து விவரம்",
  "TYPE": "வகை",
  "Type": "வகை",
  "ETM DEVICE": "இடிஎம் சாதனம்",
  "CONTROLLING ADMIN": "கட்டுப்பாட்டு நிர்வாகி",
  "TRIP INFO": "பயண விவரம்",
  "STAFF": "பணியாளர்கள்",
  "SCHEDULE": "அட்டவணை",
  "OCCUPANCY": "இருக்கை நிரப்பளவு",
  "Full": "முழுமையானது",
  "FULL": "முழுமையானது",
  "Seats": "இருக்கைகள்",
  "seats left": "இருக்கைகள் மீதம்",
  "Driver": "ஓட்டுநர்",
  "Conductor": "நடத்துனர்",
  "Plate": "பதிவு எண்",
  "Depot": "பணிமனை",
  "Capacity": "கொள்ளளவு",
  "Fare": "கட்டணம்",
  "Distance": "தூரம்",
  "Duration": "பயண நேரம்",
  "EMAIL ADDRESS": "மின்னஞ்சல் முகவரி",
  "Email Address": "மின்னஞ்சல் முகவரி",
  "PASSWORD": "கடவுச்சொல்",
  "Password": "கடவுச்சொல்",
  "Role": "பணிப்பொறுப்பு",
  "ROLE": "பணிப்பொறுப்பு",
  "Name": "பெயர்",
  "NAME": "பெயர்",
  "Phone": "தொலைபேசி",
  "PHONE": "தொலைபேசி",
  "Date": "தேதி",
  "Time": "நேரம்",

  // Statuses & Badges
  "ACTIVE": "செயலில் உள்ளது",
  "Active": "செயலில் உள்ளது",
  "RUNNING": "ஓடிக்கொண்டிருக்கிறது",
  "Running": "ஓடிக்கொண்டிருக்கிறது",
  "SCHEDULED": "திட்டமிடப்பட்டுள்ளது",
  "Scheduled": "திட்டமிடப்பட்டுள்ளது",
  "COMPLETED": "முடிவடைந்தது",
  "Completed": "முடிவடைந்தது",
  "MAINTENANCE": "பராமரிப்பில் உள்ளது",
  "INACTIVE": "செயலற்றது",
  "Inactive": "செயலற்றது",
  "TRIGGERED": "தூண்டப்பட்டது",
  "ACKNOWLEDGED": "ஏற்றுக்கொள்ளப்பட்டது",
  "RESOLVED": "தீர்க்கப்பட்டது",
  "NORMAL": "சாதாரண",
  "Normal": "சாதாரண",
  "HIGH": "அதிமுக்கிய",
  "High": "அதிமுக்கிய",
  "CRITICAL": "அவசர",
  "Critical": "அவசர",
  "AC": "குளிரூட்டப்பட்டது (AC)",
  "NON-AC": "சாதாரண பேருந்து (Non-AC)",
  "Non-AC": "சாதாரண பேருந்து (Non-AC)",
  "EXPRESS": "விரைவு",
  "Express": "விரைவு",
  "DELUXE": "டீலக்ஸ்",
  "ORDINARY": "சாதாரண கட்டணம்",
};

// Patterns for dynamic strings
const dynamicPatterns: Array<{ regex: RegExp; replace: (match: RegExpMatchArray) => string }> = [
  {
    regex: /^Trip #([A-Za-z0-9-_]+)$/i,
    replace: (m) => `பயணம் #${m[1]}`,
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
    regex: /^(\d+)\s+seats left$/i,
    replace: (m) => `${m[1]} இருக்கைகள் மீதம்`,
  },
  {
    regex: /^(\d+)\s+buses available$/i,
    replace: (m) => `${m[1]} பேருந்துகள் கிடைக்கின்றன`,
  },
  {
    regex: /^Showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)\s+(.*)$/i,
    replace: (m) => `${m[3]} ${m[4]}-ல் ${m[1]} முதல் ${m[2]} வரை காட்டப்படுகிறது`,
  },
  {
    regex: /^Total:\s*(.*)$/i,
    replace: (m) => `மொத்தம்: ${m[1]}`,
  },
  {
    regex: /^⚡ Surge \(\+(\d+) Bus\)$/i,
    replace: (m) => `⚡ கூடுதல் தேவை (+${m[1]} பேருந்து)`,
  },
];

// Pre-sort dictionary keys by length descending to match full multi-word phrases first
const sortedEntries = Object.entries(dictionary).sort(
  (a, b) => b[0].length - a[0].length
);

// Map to store original values so switching back to "en" perfectly restores the original page
const originalTextMap = new WeakMap<Node, string>();
const originalPlaceholderMap = new WeakMap<HTMLElement, string>();

function translateText(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return rawText;

  // 1. Direct dictionary match
  if (dictionary[trimmed]) {
    return rawText.replace(trimmed, dictionary[trimmed]!);
  }

  // 2. Case-insensitive dictionary match
  const lower = trimmed.toLowerCase();
  for (const [key, val] of sortedEntries) {
    if (key.toLowerCase() === lower) {
      return rawText.replace(trimmed, val);
    }
  }

  // 3. Dynamic patterns match
  for (const p of dynamicPatterns) {
    const match = trimmed.match(p.regex);
    if (match) {
      return rawText.replace(trimmed, p.replace(match));
    }
  }

  // 4. Sub-phrase replacement for compound elements
  let result = rawText;
  let changed = false;
  for (const [key, val] of sortedEntries) {
    // Only replace meaningful phrases (at least 3 chars) to avoid unintended substring corruption
    if (key.length >= 3 && result.includes(key)) {
      result = result.split(key).join(val);
      changed = true;
    }
  }

  return changed ? result : rawText;
}

interface I18nContextType {
  lang: Language;
  setLang: (l: Language) => void;
  t: (text: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: "en",
  setLang: () => {},
  t: (text: string, fallback?: string) => fallback || text,
});

export function AdminI18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === "ta" || saved === "en" ? saved : "en";
    } catch {
      return "en";
    }
  });

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch (e) {
      console.warn("Could not save language to localStorage:", e);
    }
  }, []);

  const t = useCallback(
    (text: string, fallback?: string): string => {
      if (lang === "en") return fallback || text;
      return translateText(text) || fallback || text;
    },
    [lang],
  );

  // Global Automatic DOM Translator for seamless full-page Tamil translation and clean English reversion
  useEffect(() => {
    const handleNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        if (lang === "ta") {
          if (!originalTextMap.has(node)) {
            originalTextMap.set(node, node.nodeValue);
          }
          const original = originalTextMap.get(node) || node.nodeValue;
          const translated = translateText(original);
          if (translated !== node.nodeValue) {
            node.nodeValue = translated;
          }
        } else {
          // Revert to English
          if (originalTextMap.has(node)) {
            const original = originalTextMap.get(node)!;
            if (node.nodeValue !== original) {
              node.nodeValue = original;
            }
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "CODE" || el.tagName === "PRE") {
          return;
        }

        // Translate / Revert input and textarea placeholders
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          if (lang === "ta") {
            if (el.placeholder) {
              if (!originalPlaceholderMap.has(el)) {
                originalPlaceholderMap.set(el, el.placeholder);
              }
              const orig = originalPlaceholderMap.get(el) || el.placeholder;
              const translated = translateText(orig);
              if (translated !== el.placeholder) {
                el.placeholder = translated;
              }
            }
          } else {
            // Revert placeholder
            if (originalPlaceholderMap.has(el)) {
              el.placeholder = originalPlaceholderMap.get(el)!;
            }
          }
        }

        node.childNodes.forEach(handleNode);
      }
    };

    // Apply to current DOM tree
    handleNode(document.body);

    // Dynamic MutationObserver to catch asynchronous Supabase table loads, modal mounts, dialogs
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach(handleNode);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useAdminI18n(): I18nContextType {
  return useContext(I18nContext);
}
