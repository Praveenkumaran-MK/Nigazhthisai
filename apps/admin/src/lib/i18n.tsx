import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type Language = "en" | "ta";

const STORAGE_KEY = "ngz_admin_lang";

// Complete, comprehensive bilingual dictionary (transit, revenue, alerts, operations, fleet, settings)
export const dictionary: Record<string, string> = {
  // Brand & Identity
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

  // Navigation & Core Modules
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
  "Admin Users": "நிர்வாகப் பயனர்கள்",
  "System Settings": "அமைப்பு அமைப்புகள்",
  "CSV Import": "சிஎஸ்வி பதிவேற்றம்",

  // Filters & Top Controls
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

  // Districts & Locations
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
  "TAMBARAM": "தாம்பரம்",
  "GUINDY": "கிண்டி",
  "CENTRAL": "சென்ட்ரல்",
  "EGMORE": "எழும்பூர்",

  // Specific Transit Stops & Landmarks
  "Railway Station North": "ரயில் நிலையம் வடக்கு",
  "Medical College Junction": "மருத்துவக் கல்லூரி சந்திப்பு",
  "Vallam Road Market": "வல்லம் சாலை சந்தை",
  "Karanthai Signal": "கரந்தை சிக்னல்",
  "Thanjavur New Bus Stand to Thanjavur Old Bus Stand": "தஞ்சாவூர் புதிய பேருந்து நிலையம் முதல் தஞ்சாவூர் பழைய பேருந்து நிலையம் வரை",
  "Thanjavur New Bus Stand": "தஞ்சாவூர் புதிய பேருந்து நிலையம்",
  "Thanjavur Old Bus Stand": "தஞ்சாவூர் பழைய பேருந்து நிலையம்",
  "Railway Station": "ரயில் நிலையம்",
  "New Bus Stand": "புதிய பேருந்து நிலையம்",
  "Old Bus Stand": "பழைய பேருந்து நிலையம்",
  "Bus Stand": "பேருந்து நிலையம்",
  "Bus Stop": "பேருந்து நிறுத்தம்",
  "Medical College": "மருத்துவக் கல்லூரி",
  "Vallam Road": "வல்லம் சாலை",
  "Karanthai": "கரந்தை",
  "Vallam": "வல்லம்",

  // Days of Week & Scheduling
  "Sunday": "ஞாயிறு",
  "SUNDAY": "ஞாயிறு",
  "Monday": "திங்கள்",
  "MONDAY": "திங்கள்",
  "Tuesday": "செவ்வாய்",
  "TUESDAY": "செவ்வாய்",
  "Wednesday": "புதன்",
  "WEDNESDAY": "புதன்",
  "Thursday": "வியாழன்",
  "THURSDAY": "வியாழன்",
  "Friday": "வெள்ளி",
  "FRIDAY": "வெள்ளி",
  "Saturday": "சனி",
  "SATURDAY": "சனி",
  "Today": "இன்று",
  "TODAY": "இன்று",
  "Yesterday": "நேற்று",
  "Tomorrow": "நாளை",
  "Daily": "தினசரி",
  "DAILY": "தினசரி",
  "Standard Daily": "நிலையான தினசரி",
  "STANDARD (DAILY)": "நிலையான (தினசரி)",
  "Standard (Daily)": "நிலையான (தினசரி)",
  "Select Schedule Cadence:": "அட்டவணை சுழற்சியைத் தேர்வு செய்க:",
  "SELECT SCHEDULE CADENCE:": "அட்டவணை சுழற்சியைத் தேர்வு செய்க:",
  "Add Stop to Corridor:": "வழித்தடத்தில் நிறுத்தம் சேர்க்க:",
  "ADD STOP TO CORRIDOR:": "வழித்தடத்தில் நிறுத்தம் சேர்க்க:",
  "Select bus stop to insert…": "சேர்க்க வேண்டிய பேருந்து நிறுத்தத்தைத் தேர்வு செய்க…",
  "Select bus stop to insert...": "சேர்க்க வேண்டிய பேருந்து நிறுத்தத்தைத் தேர்வு செய்க…",
  "Save Stop Sequence": "நிறுத்த வரிசையை சேமிக்க",
  "SAVE STOP SEQUENCE": "நிறுத்த வரிசையை சேமிக்க",
  "Manage Stops & ETA": "நிறுத்தங்கள் & வருகை நேரத்தை நிர்வகிக்க",
  "MANAGE STOPS & ETA": "நிறுத்தங்கள் & வருகை நேரத்தை நிர்வகிக்க",
  "MANAGE நிறுத்தங்கள் & ETA": "நிறுத்தங்கள் & வருகை நேரத்தை நிர்வகிக்க",
  "Configure Corridor": "வழித்தடத்தை உள்ளமைக்க",
  "Transit Stops & Sequence:": "போக்குவரத்து நிறுத்தங்கள் & வரிசைமுறை:",
  "Transit Stops & Sequence": "போக்குவரத்து நிறுத்தங்கள் & வரிசைமுறை",
  "STOPS ASSIGNED": "நிறுத்தங்கள் ஒதுக்கப்பட்டன",
  "stops assigned": "நிறுத்தங்கள் ஒதுக்கப்பட்டன",
  "No stops configured for this schedule. Add stops using the selector above.": "இந்த அட்டவணைக்கு எந்த நிறுத்தங்களும் அமைக்கப்படவில்லை. மேலே உள்ள தேர்வியை பயன்படுத்தி நிறுத்தங்களைச் சேர்க்கவும்.",
  "+ Add Stop": "+ நிறுத்தம் சேர்க்க",
  "Move Up": "மேலே நகர்த்து",
  "Move Down": "கீழே நகர்த்து",
  "Remove Stop": "நிறுத்தத்தை நீக்கு",

  // Revenue & Financial Audits Module
  "Revenue & Financial Audits": "வருவாய் & நிதி தணிக்கை",
  "Financial Audits": "நிதி தணிக்கை",
  "Real-time financial breakdown, custom date range filtering, digital fare analytics, and branded audit PDF export.": "நேரலை நிதி விவரங்கள், தனிப்பயன் தேதி வரம்பு வடிகட்டுதல், டிஜிட்டல் கட்டண பகுப்பாய்வு மற்றும் தணிக்கை பிடிஎஃப் ஏற்றுமதி.",
  "Export Nigazhthisai PDF": "நிகழ்த்திசை PDF ஏற்றுமதி செய்க",
  "All Operating Districts": "அனைத்து செயல்படும் மாவட்டங்கள்",
  "All Operating": "அனைத்து செயல்படும்",
  "Total Net Revenue": "மொத்த நிகர வருவாய்",
  "TOTAL NET REVENUE": "மொத்த நிகர வருவாய்",
  "TOTAL NET": "மொத்த நிகர",
  "Total Net": "மொத்த நிகர",
  "Net Revenue": "நிகர வருவாய்",
  "NET REVENUE": "நிகர வருவாய்",
  "Total Tickets Issued": "வழங்கப்பட்ட மொத்த டிக்கெட்டுகள்",
  "TOTAL TICKETS ISSUED": "வழங்கப்பட்ட மொத்த டிக்கெட்டுகள்",
  "Tickets Issued": "வழங்கப்பட்ட டிக்கெட்டுகள்",
  "TICKETS ISSUED": "வழங்கப்பட்ட டிக்கெட்டுகள்",
  "ISSUED": "வழங்கப்பட்டது",
  "Issued": "வழங்கப்பட்டது",
  "Average Ticket Fare": "சராசரி டிக்கெட் கட்டணம்",
  "AVERAGE TICKET FARE": "சராசரி டிக்கெட் கட்டணம்",
  "AVERAGE TICKET": "சராசரி டிக்கெட்",
  "Average Ticket": "சராசரி டிக்கெட்",
  "Digital Fare Adoption": "டிஜிட்டல் கட்டண பயன்பாடு",
  "DIGITAL FARE ADOPTION": "டிஜிட்டல் கட்டண பயன்பாடு",
  "DIGITAL FARE": "டிஜிட்டல் கட்டணம்",
  "Fare Adoption": "கட்டண பயன்பாடு",
  "Interactive Revenue Distribution": "ஊடாடும் வருவாய் விநியோகம்",
  "INTERACTIVE REVENUE DISTRIBUTION": "ஊடாடும் வருவாய் விநியோகம்",
  "Interactive Revenue Distribution (DAY)": "ஊடாடும் வருவாய் விநியோகம் (நாள்)",
  "Interactive Revenue Distribution (BUS)": "ஊடாடும் வருவாய் விநியோகம் (பேருந்து)",
  "Interactive Revenue Distribution (ROUTE)": "ஊடாடும் வருவாய் விநியோகம் (வழித்தடம்)",
  "Interactive Revenue Distribution (CONCESSION)": "ஊடாடும் வருவாய் விநியோகம் (சலுகை)",
  "Interactive Revenue Distribution (PAYMENT_METHOD)": "ஊடாடும் வருவாய் விநியோகம் (கட்டண முறை)",
  "Visual comparisons across segments. Hover bars to inspect exact collections.": "பிரிவுகளின் காட்சி ஒப்பீடுகள். துல்லியமான வசூலை அறிய பார்களில் கர்சரை வைக்கவும்.",
  "Total Revenue": "மொத்த வருவாய்",
  "TOTAL REVENUE": "மொத்த வருவாய்",
  "By Day": "நாள் வாரியாக",
  "By Bus": "பேருந்து வாரியாக",
  "By Route": "வழித்தடம் வாரியாக",
  "By Concession": "சலுகை வாரியாக",
  "By Payment Method": "கட்டண முறை வாரியாக",
  "7 Days": "7 நாட்கள்",
  "30 Days": "30 நாட்கள்",
  "90 Days": "90 நாட்கள்",
  "All Time": "முழு நேரம்",
  "Custom Range": "தனிப்பயன் வரம்பு",
  "From:": "இருந்து:",
  "To:": "வரை:",
  "From": "இருந்து",
  "To": "வரை",
  "tickets": "டிக்கெட்டுகள்",
  "tickets count": "டிக்கெட்டுகள் எண்ணிக்கை",
  "Loading breakdown rows…": "விவர வரிசைகள் ஏற்றப்படுகின்றன…",
  "No records found.": "பதிவுகள் எதுவும் இல்லை.",

  // Alerts & SOS Command Desk Module
  "Emergency & SOS Command Desk": "அவசர & SOS கட்டளை மையம்",
  "Continuous real-time incident telemetry, automated 60s idle fleet scanning, and live emergency responder chat.": "தொடர்ச்சியான நேரலை சம்பவ கண்காணிப்பு, தானியங்கி 60 வினாடி செயலற்ற வாகன ஸ்கேனிங் மற்றும் நேரலை பதிலளிப்பாளர் அரட்டை.",
  "Siren Armed (Click to Mute)": "சைரன் இயக்கப்பட்டது (முடக்க கிளிக் செய்க)",
  "Siren Muted (Click to Arm)": "சைரன் முடக்கப்பட்டது (இயக்க கிளிக் செய்க)",
  "Click to Arm": "இயக்க கிளிக் செய்க",
  "Click to Mute": "முடக்க கிளிக் செய்க",
  "Active Alerts": "செயலில் உள்ள எச்சரிக்கைகள்",
  "ACTIVE ALERTS": "செயலில் உள்ள எச்சரிக்கைகள்",
  "History & Audit": "வரலாறு & தணிக்கை",
  "HISTORY & AUDIT": "வரலாறு & தணிக்கை",
  "Total Active Incidents": "மொத்த செயலில் உள்ள சம்பவங்கள்",
  "TOTAL ACTIVE INCIDENTS": "மொத்த செயலில் உள்ள சம்பவங்கள்",
  "Active Incidents": "செயலில் உள்ள சம்பவங்கள்",
  "Critical / SOS Signals": "முக்கிய / SOS சமிக்ஞைகள்",
  "CRITICAL / SOS SIGNALS": "முக்கிய / SOS சமிக்ஞைகள்",
  "Requires emergency response": "அவசர பதிலளிப்பு தேவைப்படுகிறது",
  "Idle / Stationary Buses": "செயலற்ற / நிலையான பேருந்துகள்",
  "IDLE / STATIONARY BUSES": "செயலற்ற / நிலையான பேருந்துகள்",
  "Continuous 60s scan active": "தொடர்ச்சியான 60 வினாடி ஸ்கேன் செயலில் உள்ளது",
  "System Monitoring": "அமைப்பு கண்காணிப்பு",
  "SYSTEM MONITORING": "அமைப்பு கண்காணிப்பு",
  "ACTIVE": "செயலில் உள்ளது",
  "Active": "செயலில் உள்ளது",
  "Supabase Realtime synchronized": "சூபாபேஸ் நிகழ்நேர ஒருங்கிணைக்கப்பட்டது",
  "All Sources": "அனைத்து மூலங்கள்",
  "Passenger SOS": "பயணி SOS",
  "Conductor SOS": "நடத்துனர் SOS",
  "Fleet Telemetry": "வாகன தொலை அளவியல்",
  "No active alerts": "செயலில் உள்ள எச்சரிக்கைகள் இல்லை",
  "All clear across fleet operations for this filter.": "இந்த வடிப்பானுக்கான பேருந்து செயல்பாடுகள் அனைத்தும் சீராக உள்ளன.",
  "SOS triggered by conductor": "நடத்துனரால் SOS தூண்டப்பட்டது",
  "SOS triggered by passenger": "பயணியால் SOS தூண்டப்பட்டது",
  "Stationary / Idle bus alert": "செயலற்ற பேருந்து எச்சரிக்கை",
  "Acknowledge": "ஏற்றுக்கொள்",
  "ACKNOWLEDGE": "ஏற்றுக்கொள்",
  "Resolve": "தீர்வு செய்",
  "RESOLVE": "தீர்வு செய்",
  "Responder Chat": "பதிலளிப்பாளர் அரட்டை",
  "Hide Chat": "அரட்டையை மறை",
  "No messages yet. Send instructions below.": "செய்திகள் எதுவும் இல்லை. கீழே வழிமுறைகளை அனுப்பவும்.",
  "Type responder instruction…": "பதிலளிப்பாளர் வழிமுறையை தட்டச்சு செய்க…",
  "Send": "அனுப்பு",
  "Filter by bus, title, or message…": "பேருந்து, தலைப்பு அல்லது செய்தி மூலம் வடிகட்டுக…",
  "All Severities": "அனைத்து தீவிரம்",
  "All Statuses": "அனைத்து நிலைகள்",
  "Triggered": "தூண்டப்பட்டது",
  "Acknowledged": "ஏற்றுக்கொள்ளப்பட்டது",
  "Resolved": "தீர்வு செய்யப்பட்டது",
  "acknowledged": "ஏற்றுக்கொள்ளப்பட்டது",

  // Executive Mission Control / Dashboard
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
  "Open Pipeline Tracker": "நேரலை பைப்லைன் திறக்க",
  "Investigate Alerts": "எச்சரிக்கைகளை ஆராய்க",
  "Inspect Live Pipeline": "நேரலை பைப்லைனை ஆய்வு செய்க",
  "Manage Routes & ETAs": "வழித்தடங்கள் & நேரங்களை நிர்வகிக்க",
  "Review Ticket Revenue": "டிக்கெட் வருவாயை மதிப்பாய்வு செய்க",
  "Check Active Drivers": "செயலில் உள்ள நடத்துனர்களைச் சரிபார்க்க",
  "Resolve Incidents": "சிக்கல்களைத் தீர்க்க",
  "Configure Pricing": "கட்டணங்களை உள்ளமைக்க",
  "Audit Hardware Logs": "வன்பொருள் பதிவுகளை தணிக்கை செய்க",
  "Security & Access Logs": "பாதுகாப்பு & அணுகல் பதிவுகள்",
  "Telemetry & Latency Logs": "தொலை அளவியல் பதிவுகள்",
  "Database & API Health": "தரவுத்தள & ஏபிஐ நிலை",

  // Fleet, Stops, Buses, Trips Tables & Modals
  "Bus Stops Directory": "பேருந்து நிறுத்தங்கள் பட்டியல்",
  "Network bus stop infrastructure, GPS geolocations, and corridor mapping.": "பேருந்து நிறுத்தம் கட்டமைப்பு, ஜிபிஎஸ் இருப்பிடங்கள் மற்றும் வழித்தட வரைபடம்.",
  "+ New Stop": "+ புதிய நிறுத்தம்",
  "Search stops by name, code, or landmark…": "பெயர், குறியீடு அல்லது அடையாளம் மூலம் நிறுத்தங்களைத் தேடுக…",
  "Stop Code": "நிறுத்தக் குறியீடு",
  "Stop Name": "நிறுத்தப் பெயர்",
  "Location Coordinates": "இருப்பிட ஆயத்தொலைவுகள்",
  "Associated Routes": "தொடர்புடைய வழித்தடங்கள்",
  "Edit Stop": "நிறுத்தத்தைத் திருத்து",
  "Delete Stop": "நிறுத்தத்தை நீக்கு",
  "Fleet Management": "பேருந்துக் குழு மேலாண்மை",
  "Live fleet status, registration numbers, capacity, and active route assignments.": "நேரலை பேருந்து நிலை, பதிவு எண்கள், கொள்ளளவு மற்றும் வழித்தட ஒதுக்கீடுகள்.",
  "+ Add Bus": "+ பேருந்து சேர்க்க",
  "Plate Number": "பதிவு எண்",
  "Bus Model / Type": "பேருந்து மாதிரி / வகை",
  "Seating Capacity": "இருக்கை கொள்ளளவு",
  "Assigned Route": "ஒதுக்கப்பட்ட வழித்தடம்",
  "Assigned Conductor": "ஒதுக்கப்பட்ட நடத்துனர்",
  "Bus Status": "பேருந்து நிலை",
  "In Service": "சேவையில் உள்ளது",
  "Out of Service": "சேவையில் இல்லை",
  "Under Maintenance": "பராமரிப்பில் உள்ளது",
  "Operational Trips & Live Fleet Dispatch": "செயல்பாட்டு பயணங்கள் & நேரலை பேருந்து அனுப்புகை",
  "Real-time trip tracking, departure schedules, conductor manifests, and passenger occupancy.": "நேரலை பயண கண்காணிப்பு, புறப்பாடு அட்டவணைகள் மற்றும் பயணிகள் எண்ணிக்கை.",
  "+ Dispatch New Trip": "+ புதிய பயணத்தை அனுப்புக",
  "Trip ID": "பயணக் குறியீடு",
  "Departure Time": "புறப்படும் நேரம்",
  "Arrival Time": "சேரும் நேரம்",
  "Occupancy": "பயணிகள் எண்ணிக்கை",
  "Completed": "முடிவடைந்தது",
  "In Transit": "பயணத்தில் உள்ளது",
  "Scheduled": "திட்டமிடப்பட்டது",
  "Cancelled": "ரத்து செய்யப்பட்டது",
  "Conductor": "நடத்துனர்",
  "Driver": "ஓட்டுநர்",
  "Passenger": "பயணி",
  "Trip": "பயணம்",
  "Route": "வழித்தடம்",
  "Bus": "பேருந்து",
  "Stop": "நிறுத்தம்",
  "ETA": "வருகை நேரம்",

  // General Actions, Controls, and Badges
  "Search…": "தேடுக…",
  "Filter…": "வடிப்பான்கள்…",
  "Loading…": "ஏற்றப்படுகிறது…",
  "Saving…": "சேமிக்கப்படுகிறது…",
  "Cancel": "ரத்து செய்",
  "Save": "சேமி",
  "Submit": "சமர்ப்பிக்க",
  "Confirm": "உறுதி செய்",
  "Delete": "நீக்கு",
  "Edit": "திருத்து",
  "Actions": "செயல்கள்",
  "Close": "மூடு",
  "Next": "அடுத்து",
  "Previous": "முந்தைய",
  "Download": "பதிவிறக்கு",
  "Export": "ஏற்றுமதி செய்க",
  "Print": "அச்சிடுக",
  "Refresh": "புதுப்பி",
  "Clear Filters": "வடிப்பான்களை அழிக்க",
  "Success": "வெற்றி",
  "Error": "பிழை",
  "Warning": "எச்சரிக்கை",
  "Notice": "அறிவிப்பு",
  "Status": "நிலை",
  "Date": "தேதி",
  "Time": "நேரம்",
  "Name": "பெயர்",
  "Code": "குறியீடு",
  "Type": "வகை",
  "Role": "பாத்திரம்",
  "Phone": "தொலைபேசி",
  "Email": "மின்னஞ்சல்",
  "Password": "கடவுச்சொல்",
  "Created At": "உருவாக்கப்பட்ட நேரம்",
  "Updated At": "புதுப்பிக்கப்பட்ட நேரம்",
  "Notes": "குறிப்புகள்",
  "Description": "விளக்கம்",
  "Details": "விவரங்கள்",
  "View Details": "விவரங்களைக் காண்க",
  "ENABLED": "இயக்கப்பட்டது",
  "DISABLED": "முடக்கப்பட்டது",
  "ACTIVE IN SERVICE": "சேவையில் செயலில் உள்ளது",
  "STANDBY": "காத்திருப்பு",
  "MAINTENANCE": "பராமரிப்பு",
  "OFFLINE": "ஆஃப்லைன்",
  "HEALTHY": "நன்றாக உள்ளது",
  "ONLINE": "ஆன்லைன்",
  "CRITICAL": "அவசரம்",
  "LOW": "குறைவு",
  "MEDIUM": "நடுத்தரம்",
  "HIGH": "அதிகம்",
  "ALL": "அனைத்தும்",
  "All": "அனைத்தும்",

  // Resource CRUD Core Operations & Buttons
  "CREATE NEW STOP": "புதிய நிறுத்தம் உருவாக்கு",
  "Create New Stop": "புதிய நிறுத்தம் உருவாக்கு",
  "Search stops...": "நிறுத்தங்களைத் தேடுக...",
  "Search stops": "நிறுத்தங்களைத் தேடுக",
  "Stop created": "நிறுத்தம் உருவாக்கப்பட்டது",
  "Stop updated": "நிறுத்தம் புதுப்பிக்கப்பட்டது",
  "CREATE NEW ROUTE": "புதிய வழித்தடம் உருவாக்கு",
  "Create New Route": "புதிய வழித்தடம் உருவாக்கு",
  "Search routes...": "வழித்தடங்களைத் தேடுக...",
  "Route created": "வழித்தடம் உருவாக்கப்பட்டது",
  "Route updated": "வழித்தடம் புதுப்பிக்கப்பட்டது",
  "CREATE NEW BUS": "புதிய பேருந்து உருவாக்கு",
  "Create New Bus": "புதிய பேருந்து உருவாக்கு",
  "Search buses...": "பேருந்துகளைத் தேடுக...",
  "Bus created": "பேருந்து உருவாக்கப்பட்டது",
  "Bus updated": "பேருந்து புதுப்பிக்கப்பட்டது",
  "CREATE NEW TRIP": "புதிய பயணம் உருவாக்கு",
  "Create New Trip": "புதிய பயணம் உருவாக்கு",
  "Search trips...": "பயணங்களைத் தேடுக...",
  "Trip created": "பயணம் உருவாக்கப்பட்டது",
  "Trip updated": "பயணம் புதுப்பிக்கப்பட்டது",
  "CREATE NEW SCHEDULE": "புதிய அட்டவணை உருவாக்கு",
  "Create New Schedule": "புதிய அட்டவணை உருவாக்கு",
  "Search schedules...": "அட்டவணைகளைத் தேடுக...",
  "Schedule created": "அட்டவணை உருவாக்கப்பட்டது",
  "Schedule updated": "அட்டவணை புதுப்பிக்கப்பட்டது",
  "CREATE NEW FARE": "புதிய கட்டணம் உருவாக்கு",
  "Create New Fare": "புதிய கட்டணம் உருவாக்கு",
  "Search fares...": "கட்டணங்களைத் தேடுக...",
  "Fare created": "கட்டணம் உருவாக்கப்பட்டது",
  "Fare updated": "கட்டணம் புதுப்பிக்கப்பட்டது",
  "CREATE NEW DISTRICT": "புதிய மாவட்டம் உருவாக்கு",
  "Create New District": "புதிய மாவட்டம் உருவாக்கு",
  "Search districts...": "மாவட்டங்களைத் தேடுக...",
  "District created": "மாவட்டம் உருவாக்கப்பட்டது",
  "District updated": "மாவட்டம் புதுப்பிக்கப்பட்டது",
  "CREATE NEW CONDUCTOR": "புதிய நடத்துனர் உருவாக்கு",
  "Create New Conductor": "புதிய நடத்துனர் உருவாக்கு",
  "Search conductors...": "நடத்துனர்களைத் தேடுக...",
  "Conductor created": "நடத்துனர் உருவாக்கப்பட்டது",
  "Conductor updated": "நடத்துனர் புதுப்பிக்கப்பட்டது",
  "CREATE NEW ADMIN USER": "புதிய நிர்வாகப் பயனர் உருவாக்கு",
  "Create New Admin User": "புதிய நிர்வாகப் பயனர் உருவாக்கு",
  "Search users...": "பயனர்களைத் தேடுக...",
  "User created": "பயனர் உருவாக்கப்பட்டது",
  "User updated": "பயனர் புதுப்பிக்கப்பட்டது",
  "CREATE NEW RECORD": "புதிய பதிவு உருவாக்கு",
  "Create New Record": "புதிய பதிவு உருவாக்கு",
  "Record created": "பதிவு உருவாக்கப்பட்டது",
  "Record updated": "பதிவு புதுப்பிக்கப்பட்டது",
  "Delete this record?": "இந்தப் பதிவை நீக்கவா?",
  "This action cannot be undone.": "இந்தச் செயலை மீட்டெடுக்க முடியாது.",
  "Deleted": "நீக்கப்பட்டது",
  "Could not delete": "நீக்க முடியவில்லை",
  "Could not save": "சேமிக்க முடியவில்லை",
  "Something went wrong": "ஏதோ தவறு நடந்துவிட்டது",
  "No stops found": "நிறுத்தங்கள் எதுவும் கிடைக்கவில்லை",
  "No routes found": "வழித்தடங்கள் எதுவும் கிடைக்கவில்லை",
  "No buses found": "பேருந்துகள் எதுவும் கிடைக்கவில்லை",
  "No trips found": "பயணங்கள் எதுவும் கிடைக்கவில்லை",
  "No schedules found": "அட்டவணைகள் எதுவும் கிடைக்கவில்லை",
  "No fares found": "கட்டணங்கள் எதுவும் கிடைக்கவில்லை",
  "No conductors found": "நடத்துனர்கள் எதுவும் கிடைக்கவில்லை",
  "No users found": "பயனர்கள் எதுவும் கிடைக்கவில்லை",
  "No records found": "பதிவுகள் எதுவும் கிடைக்கவில்லை",
  "Edit Bus": "பேருந்தைத் திருத்து",
  "Edit Trip": "பயணத்தைத் திருத்து",
  "Edit Schedule": "அட்டவணையைத் திருத்து",
  "Edit Fare": "கட்டணத்தைத் திருத்து",
  "Edit User": "பயனரைத் திருத்து",
  "Edit Conductor": "நடத்துனரைத் திருத்து",

  // Core Table Column Headers
  "COORDINATES": "ஆயத்தொலைவுகள்",
  "CORRIDOR": "வழித்தடம்",
  "SCHEDULE": "அட்டவணை",
  "BUS NUMBER": "பேருந்து எண்",
  "Bus number": "பேருந்து எண்",
  "Bus Number": "பேருந்து எண்",
  "CAPACITY": "கொள்ளளவு",
  "Capacity": "கொள்ளளவு",
  "ORIGIN": "தொடக்க நிறுத்தம்",
  "DESTINATION": "சேருமிடம்",
  "Destination stop": "சேருமிட நிறுத்தம்",
  "Origin stop": "தொடக்க நிறுத்தம்",
  "FARE": "கட்டணம்",
  "Fare amount (₹)": "கட்டணத் தொகை (₹)",
  "DEPARTURE": "புறப்பாடு",
  "ARRIVAL": "வருகை",
  "DURATION": "கால அளவு",
  "Duration (h)": "கால அளவு (மணிநேரம்)",
  "SERIAL": "வரிசை எண்",
  "BATTERY": "பேட்டரி நிலை",
  "Battery Level": "பேட்டரி நிலை",

  // Core Page Descriptions & Instructional Copy
  "Bus stops used by routes across the district.": "மாவட்டம் முழுவதும் வழித்தடங்களால் பயன்படுத்தப்படும் பேருந்து நிறுத்தங்கள்.",
  "Fleet vehicles, each optionally assigned to a route and operating district.": "வாகனக் குழு, ஒவ்வொன்றும் விருப்பத்தேர்வாக ஒரு வழித்தடம் மற்றும் மாவட்டத்திற்கு ஒதுக்கப்பட்டுள்ளது.",
  "Flat fare per origin/destination pair on a route.": "ஒரு வழித்தடத்தில் தொடக்கம்/சேருமிடம் இணைக்கான நிலையான கட்டணம்.",
  "Ordering here is authoritative for fare lookup and eligible-bus filtering.": "கட்டணக் கணக்கீடு மற்றும் பேருந்து வடிகட்டலுக்கு இந்த வரிசைமுறை முதன்மையானது.",
  "Select a route": "வழித்தடத்தைத் தேர்வு செய்க",
  "Select district": "மாவட்டத்தைத் தேர்வு செய்க",
  "Select a stop": "நிறுத்தத்தைத் தேர்வு செய்க",
  "No route assigned": "வழித்தடம் எதுவும் ஒதுக்கப்படவில்லை",
  "Non-AC": "ஏசி அல்லாதது",
  "AC": "ஏசி",
  "Stop name": "நிறுத்தப் பெயர்",
  "Stop code": "நிறுத்தக் குறியீடு",
  "Latitude": "அட்சரேகை (Latitude)",
  "Longitude": "தீர்க்கரேகை (Longitude)",
  "No stops on this route yet": "இந்த வழித்தடத்தில் இன்னும் நிறுத்தங்கள் சேர்க்கப்படவில்லை",
  "Add stops below in the order buses will visit them.": "பேருந்துகள் செல்லும் வரிசையில் கீழே நிறுத்தங்களைச் சேர்க்கவும்.",
  "Add stop": "நிறுத்தம் சேர்",
  "Add": "சேர்",
  "Remove": "நீக்கு",
  "Could not add stop": "நிறுத்தத்தைச் சேர்க்க முடியவில்லை",
  "Could not remove stop": "நிறுத்தத்தை நீக்க முடியவில்லை",
  "Could not reorder stop": "நிறுத்த வரிசையை மாற்ற முடியவில்லை",

  // Corridor Management & Metrics
  "Transit Stops": "போக்குவரத்து நிறுத்தங்கள்",
  "Search corridors by name, code, or number...": "பெயர், குறியீடு அல்லது எண் மூலம் வழித்தடங்களைத் தேடுக...",
  "CREATE ROUTE": "புதிய வழித்தடம்",
  "Create Route": "புதிய வழித்தடம்",
  "Cards": "அட்டைகள்",
  "Table": "அட்டவணை",
  "Loading corridors…": "வழித்தடங்கள் ஏற்றப்படுகின்றன…",
  "No transit corridors match your search.": "உங்கள் தேடலுக்கு ஏற்ற வழித்தடங்கள் எதுவும் இல்லை.",
  "Try clearing filters or adding a new route.": "வடிப்பான்களை அழிக்கவும் அல்லது புதிய வழித்தடத்தைச் சேர்க்கவும்.",
  "Timetable Departures": "புறப்பாடு கால அட்டவணை",
  "Delete Route": "வழித்தடத்தை நீக்கு",
  "Route Updated Successfully": "வழித்தடம் வெற்றிகரமாகப் புதுப்பிக்கப்பட்டது",
  "Route Deleted": "வழித்தடம் நீக்கப்பட்டது",
  "Route Created Successfully": "வழித்தடம் வெற்றிகரமாக உருவாக்கப்பட்டது",
  "Days / Week": "நாட்கள் / வாரம்",

  // Single Trips & Weekly Schedules
  "Single Trip Schedules": "தனிப் பயண அட்டவணைகள்",
  "Weekly Schedule Templates": "வாராந்திர அட்டவணை வார்ப்புருக்கள்",
  "Schedule Trip (Wizard)": "பயண வழிகாட்டி (விசாரணை)",
  "Add Weekly Template": "வாராந்திர வார்ப்புரு சேர்",
  "Confirm & Launch Trip": "உறுதிசெய்து பயணத்தைத் தொடங்கு",
  "Create Template": "வார்ப்புருவை உருவாக்கு",
  "Preferred Conductor": "விருப்பமான நடத்துனர்",
  "Single Trips": "தனிப் பயணங்கள்",
  "Template Matrix": "வார்ப்புரு மேட்ரிக்ஸ்",
  "Departure Time (HH:MM)": "புறப்படும் நேரம் (HH:MM)",
  "Scheduled Start": "திட்டமிடப்பட்ட தொடக்கம்",
  "Duration (Hours)": "கால அளவு (மணிநேரம்)",
  "Schedule New Trip": "புதிய பயணத்தைத் திட்டமிடு",
  "Trip Scheduled Successfully": "பயணம் வெற்றிகரமாகத் திட்டமிடப்பட்டது",
  "Trip Details Updated & Audited": "பயண விவரங்கள் புதுப்பிக்கப்பட்டு தணிக்கை செய்யப்பட்டன",
  "Filter Status:": "நிலை வடிகட்டி:",
  "ALL STATUSES": "அனைத்து நிலைகள்",
  "Audit History": "தணிக்கை வரலாறு",
  "Save Changes": "மாற்றங்களைச் சேமி",

  // Revenue & Financial Analytics
  "Tickets Sold": "விற்கப்பட்ட டிக்கெட்டுகள்",
  "Average Fare": "சராசரி கட்டணம்",
  "Cash Share": "ரொக்கப் பங்கு",
  "Digital Share": "டிஜிட்டல் பங்கு",

  // Operational Alerts & Incidents
  "Operational Alerts & SOS": "செயல்பாட்டு எச்சரிக்கைகள் & SOS",
  "Incident History": "சம்பவ வரலாறு",
  "Trigger Test Alert": "சோதனை எச்சரிக்கையைத் தொடங்கு",
  "Audio Siren Enabled": "ஒலி எச்சரிக்கை இயக்கப்பட்டது",
  "Audio Siren Disabled": "ஒலி எச்சரிக்கை முடக்கப்பட்டது",
  "Resolve Incident": "சம்பவத்தைத் தீர்வு செய்",
  "Incident Details": "சம்பவ விவரங்கள்",
  "Acknowledge Alert": "எச்சரிக்கையை ஏற்றுக்கொள்",
  "Filter Source:": "மூல வடிகட்டி:",
  "ALL SOURCES": "அனைத்து மூலங்கள்",

  // Fleet & Maintenance
  "Active In-Service Trips": "சேவையில் உள்ள பயணங்கள்",
  "Speed": "வேகம்",
  "Delay": "தாமதம்",
  "On Time": "சரியான நேரத்தில்",
  "Departed": "புறப்பட்டது",
  "Current": "தற்போது",
  "Upcoming": "வரவிருப்பது",
  "Log Maintenance Event": "பராமரிப்பு நிகழ்வைப் பதிவு செய்",
  "Resource Type": "வள வகை",
  "Select Bus": "பேருந்தைத் தேர்வு செய்க",
  "Select ETM": "இடிஎம் சாதனத்தைத் தேர்வு செய்க",
  "Maintenance Status": "பராமரிப்பு நிலை",
  "Battery Level (%)": "பேட்டரி நிலை (%)",
  "Notes / Findings": "குறிப்புகள் / ஆய்வு முடிவுகள்",
  "UNDER_MAINTENANCE": "பராமரிப்பில் உள்ளது",
  "INSPECTION_PENDING": "ஆய்வு நிலுவையில் உள்ளது",
  "REPAIRED": "பழுதுநீக்கப்பட்டது",
  "DECOMMISSIONED": "செயலிழக்கப்பட்டது",

  // ETM Devices & QR
  "Electronic Ticketing Machines (ETM)": "மின்னணு டிக்கெட் சாதனங்கள் (ETM)",
  "Register Device": "சாதனத்தைப் பதிவு செய்",
  "Register ETM": "இடிஎம் பதிவு செய்",
  "Assigned Bus": "ஒதுக்கப்பட்ட பேருந்து",
  "Assign ETM": "இடிஎம் சாதனத்தை ஒதுக்கு",
  "Assign to Duty": "பணிக்கு ஒதுக்கு",
  "Bus QR Codes & Ticketing Validation": "பேருந்து க்யூஆர் & டிக்கெட் சரிபார்ப்பு",
  "Generate QR": "க்யூஆர் உருவாக்கு",
  "Regenerate QR": "க்யூஆர் மீண்டும் உருவாக்கு",
  "Print QR": "க்யூஆர் அச்சிடுக",
  "Copy Payload": "விவரங்களை நகலெடு",
  "QR Generated": "க்யூஆர் உருவாக்கப்பட்டது",

  // Passenger Complaints
  "Passenger Complaints & Grievance Resolution": "பயணிகள் புகார்கள் & குறைதீர்ப்பு",
  "Safety & Security": "பாதுகாப்பு & உறுதி",
  "Overcrowding": "அதிக நெரிசல்",
  "Fare Overcharging": "கூடுதல் கட்டணம் வசூலிப்பு",
  "Driver / Crew Conduct": "ஓட்டுநர் / ஊழியர் நடத்தை",
  "Cleanliness & Hygiene": "தூய்மை & சுகாதாரம்",
  "General Grievance": "பொதுவான புகார்",
  "OPEN": "திறந்துள்ளது",
  "IN_REVIEW": "மதிப்பாய்வில் உள்ளது",
  "RESOLVED": "தீர்வு செய்யப்பட்டது",
  "DISMISSED": "நிராகரிக்கப்பட்டது",
  "Mark In Review": "மதிப்பாய்வுக்கு மாற்று",
  "Resolve Grievance": "புகாரைத் தீர்வு செய்",
  "Dismiss": "நிராகரி",

  // Admin Users & Regional Divisions
  "Admin Users & Access Control": "நிர்வாகப் பயனர்கள் & அணுகல் கட்டுப்பாடு",
  "Add District Admin": "மாவட்ட நிர்வாகியைச் சேர்",
  "Master Admin": "முதன்மை நிர்வாகி",
  "District Admin": "மாவட்ட நிர்வாகி",
  "Suspended": "இடைநீக்கம் செய்யப்பட்டது",
  "Delete Admin": "நிர்வாகியை நீக்கு",
  "Are you sure you want to remove this admin?": "இந்த நிர்வாகியை நிச்சயமாக நீக்க விரும்புகிறீர்களா?",
  "Districts & Regional Divisions": "மாவட்டங்கள் & மண்டலப் பிரிவுகள்",
  "Add New District": "புதிய மாவட்டத்தைச் சேர்",
  "District Name": "மாவட்டப் பெயர்",
  "District Code": "மாவட்டக் குறியீடு",
  "State": "மாநிலம்",
  "Buses Active": "செயலில் உள்ள பேருந்துகள்",
  "Conductors Active": "செயலில் உள்ள நடத்துனர்கள்",

  // System Settings
  "System Settings & Authority Configuration": "அமைப்பு அமைப்புகள் & நிர்வாக கட்டமைப்பு",
  "Transport Authority Name": "போக்குவரத்து கழகத்தின் பெயர்",
  "Payment Gateway UPI ID": "பணம் செலுத்தும் UPI முகவரி",
  "Digital Payments Active": "டிஜிட்டல் கட்டணம் செயலில் உள்ளது",
  "Customer Support Phone": "வாடிக்கையாளர் ஆதரவு எண்",
  "Support Email": "ஆதரவு மின்னஞ்சல்",
  "Save Configuration": "அமைப்புகளைச் சேமி",
  "Saving Settings…": "அமைப்புகள் சேமிக்கப்படுகின்றன…",

  // CSV Import
  "Bulk CSV Data Import": "மொத்த சிஎஸ்வி தரவு பதிவேற்றம்",
  "Import Stops, Routes, and Fares in Bulk": "நிறுத்தங்கள், வழித்தடங்கள் மற்றும் கட்டணங்களை மொத்தமாகப் பதிவேற்றுக",
  "Select Entity Kind": "பதிவேற்ற வகையைத் தேர்வு செய்க",
  "Upload CSV File": "சிஎஸ்வி கோப்பை பதிவேற்றுக",
  "Drag and drop CSV here, or click to browse": "சிஎஸ்வி கோப்பை இங்கே இழுத்து விடவும், அல்லது கிளிக் செய்து தேர்வு செய்யவும்",
  "Validate & Preview": "சரிபார்த்து முன்னோட்டம் காண்க",
  "Confirm & Import": "உறுதிசெய்து பதிவேற்றுக",
  "Rows Validated": "வரிசைகள் சரிபார்க்கப்பட்டன",
  "Import Completed": "பதிவேற்றம் முடிந்தது",
};

// Auto-populate reverse dictionary to guarantee 100% bidirectional coverage
export const reverseDictionary: Record<string, string> = {};
for (const [en, ta] of Object.entries(dictionary)) {
  // Map clean Tamil phrases back to their English counterparts
  if (!reverseDictionary[ta]) {
    reverseDictionary[ta] = en;
  }
}

// Case-insensitive lookup map for all English phrases
const lowerDictMap = new Map<string, string>();
for (const [en, ta] of Object.entries(dictionary)) {
  lowerDictMap.set(en.toLowerCase(), ta);
}

// Dynamic Translation Memory (captures every translation and transliteration for clean reversion)
const translationMemory = new Map<string, string>();

export function recordTranslation(en: string, ta: string) {
  if (en && ta && en !== ta) {
    translationMemory.set(ta, en);
    translationMemory.set(ta.trim(), en.trim());
  }
}

// Dynamic regex patterns for parameterized English phrases
const dynamicPatterns: Array<{ regex: RegExp; replace: (match: RegExpMatchArray) => string }> = [
  {
    regex: /^(\d+)\s+tickets?$/i,
    replace: (m) => `${m[1]} டிக்கெட்டுகள்`,
  },
  {
    regex: /^(\d+)\s+tix$/i,
    replace: (m) => `${m[1]} டிக்கெட்டுகள்`,
  },
  {
    regex: /^(\d+)\s+STOPS?\s+ASSIGNED$/i,
    replace: (m) => `${m[1]} நிறுத்தங்கள் ஒதுக்கப்பட்டன`,
  },
  {
    regex: /^(\d+)\s+stops?\s+assigned$/i,
    replace: (m) => `${m[1]} நிறுத்தங்கள் ஒதுக்கப்பட்டன`,
  },
  {
    regex: /^(\d+)\s+stops?$/i,
    replace: (m) => `${m[1]} நிறுத்தங்கள்`,
  },
  {
    regex: /^(\d+)\s+Days?$/i,
    replace: (m) => `${m[1]} நாட்கள்`,
  },
  {
    regex: /^(\d+)\s+buses?$/i,
    replace: (m) => `${m[1]} பேருந்துகள்`,
  },
  {
    regex: /^(\d+)\s+acknowledged$/i,
    replace: (m) => `${m[1]} ஏற்றுக்கொள்ளப்பட்டது`,
  },
  {
    regex: /^Active Alerts\s*\((\d+)\)$/i,
    replace: (m) => `செயலில் உள்ள எச்சரிக்கைகள் (${m[1]})`,
  },
  {
    regex: /^Active in Service\s*\((\d+)\)$/i,
    replace: (m) => `சேவையில் செயலில் உள்ளது (${m[1]})`,
  },
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

// Dynamic regex patterns for reverse conversion (Tamil -> English)
const reversePatterns: Array<{ regex: RegExp; replace: (match: RegExpMatchArray) => string }> = [
  {
    regex: /^(\d+)\s+டிக்கெட்டுகள்$/i,
    replace: (m) => `${m[1]} tickets`,
  },
  {
    regex: /^(\d+)\s+நிறுத்தங்கள்\s+ஒதுக்கப்பட்டன$/i,
    replace: (m) => `${m[1]} STOPS ASSIGNED`,
  },
  {
    regex: /^(\d+)\s+நிறுத்தங்கள்$/i,
    replace: (m) => `${m[1]} stops`,
  },
  {
    regex: /^(\d+)\s+நாட்கள்$/i,
    replace: (m) => `${m[1]} Days`,
  },
  {
    regex: /^(\d+)\s+பேருந்துகள்$/i,
    replace: (m) => `${m[1]} buses`,
  },
  {
    regex: /^(\d+)\s+ஏற்றுக்கொள்ளப்பட்டது$/i,
    replace: (m) => `${m[1]} acknowledged`,
  },
  {
    regex: /^செயலில் உள்ள எச்சரிக்கைகள்\s*\((\d+)\)$/i,
    replace: (m) => `Active Alerts (${m[1]})`,
  },
  {
    regex: /^பயணம்\s*#([A-Za-z0-9-_]+)$/i,
    replace: (m) => `Trip #${m[1]}`,
  },
  {
    regex: /^வழித்தடம்\s+([A-Za-z0-9-_]+)$/i,
    replace: (m) => `Route ${m[1]}`,
  },
  {
    regex: /^வருகை நேரம்:\s*(.*)$/i,
    replace: (m) => `ETA: ${m[1]}`,
  },
  {
    regex: /^மொத்தம்:\s*(.*)$/i,
    replace: (m) => `Total: ${m[1]}`,
  },
];

// Sort dictionary keys by length descending so compound phrases match first
const sortedEntries = Object.entries(dictionary).sort(
  (a, b) => b[0].length - a[0].length
);

const sortedReverseEntries = Object.entries(reverseDictionary).sort(
  (a, b) => b[0].length - a[0].length
);

function escapeRegex(str: string) {
  return str.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
}

// Phonetic Transliteration Engine for new user/stop/route names not in dictionary
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
  // Preserve numbers, plates, and codes (e.g. TN-38, ETM-01, 7C, RSN-04)
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

// Auto-Translation Engine (English -> Tamil)
export function translateText(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return rawText;

  // 1. Direct exact dictionary match
  if (dictionary[trimmed]) {
    const res = dictionary[trimmed]!;
    recordTranslation(trimmed, res);
    return rawText.replace(trimmed, res);
  }

  // 2. Direct case-insensitive dictionary match
  const lowerTrimmed = trimmed.toLowerCase();
  if (lowerDictMap.has(lowerTrimmed)) {
    const res = lowerDictMap.get(lowerTrimmed)!;
    recordTranslation(trimmed, res);
    return rawText.replace(trimmed, res);
  }

  // 3. Dynamic patterns match
  for (const p of dynamicPatterns) {
    const match = trimmed.match(p.regex);
    if (match) {
      const res = p.replace(match);
      recordTranslation(trimmed, res);
      return rawText.replace(trimmed, res);
    }
  }

  // 4. Trailing punctuation handling (e.g. "Cadence:", "From:", "To:")
  const punctMatch = trimmed.match(/^(.*?)([:.,!?()[\]]+)$/);
  if (punctMatch) {
    const base = punctMatch[1]!.trim();
    const punct = punctMatch[2]!;
    if (dictionary[base] || lowerDictMap.has(base.toLowerCase())) {
      const translatedBase = dictionary[base] || lowerDictMap.get(base.toLowerCase())!;
      const res = translatedBase + punct;
      recordTranslation(trimmed, res);
      return rawText.replace(trimmed, res);
    }
  }

  // 5. Corridor & Modal decomposed templates
  const corridorMatch = trimmed.match(/^Transit Stops & Sequence:\s*(.*)$/i);
  if (corridorMatch) {
    const corridorName = corridorMatch[1]!;
    const transCorridor = translateText(corridorName);
    const res = `போக்குவரத்து நிறுத்தங்கள் & வரிசைமுறை: ${transCorridor}`;
    recordTranslation(trimmed, res);
    return rawText.replace(trimmed, res);
  }

  const timetableMatch = trimmed.match(/^Timetable:\s*Route\s*(.*)$/i);
  if (timetableMatch) {
    const res = `கால அட்டவணை: வழித்தடம் ${timetableMatch[1]}`;
    recordTranslation(trimmed, res);
    return rawText.replace(trimmed, res);
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

  const toMatch = trimmed.match(/^(.*?)\s+to\s+(.*)$/i);
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
  "should", "now", "cannot", "could", "would", "please", "used", "across"
]);

// Landmark words common in dynamic stop and station names
const landmarkReplacements: Array<[RegExp, string]> = [
  [/\bBus Stand\b/gi, "பேருந்து நிலையம்"],
  [/\bBus Stop\b/gi, "பேருந்து நிறுத்தம்"],
  [/\bRailway Station\b/gi, "ரயில் நிலையம்"],
  [/\bRailway\b/gi, "ரயில்வே"],
  [/\bJunction\b/gi, "சந்திப்பு"],
  [/\bCheckpost\b/gi, "செக்போஸ்ட்"],
  [/\bHospital\b/gi, "மருத்துவமனை"],
  [/\bCollege\b/gi, "கல்லூரி"],
  [/\bSchool\b/gi, "பள்ளி"],
  [/\bTemple\b/gi, "கோவில்"],
  [/\bChurch\b/gi, "தேவாலயம்"],
  [/\bMosque\b/gi, "மசூதி"],
  [/\bDepot\b/gi, "பணிமனை"],
  [/\bFlyover\b/gi, "மேம்பாலம்"],
  [/\bBridge\b/gi, "பாலம்"],
  [/\bBypass\b/gi, "பைபாஸ்"],
  [/\bCircle\b/gi, "வட்டம்"],
  [/\bCorner\b/gi, "முனை"],
  [/\bRoad\b/gi, "சாலை"],
  [/\bStreet\b/gi, "தெரு"],
  [/\bAvenue\b/gi, "அவென்யூ"],
  [/\bNagar\b/gi, "நகர்"],
  [/\bColony\b/gi, "காலனி"],
  [/\bLayout\b/gi, "லேஅவுட்"],
  [/\bMarket\b/gi, "சந்தை"],
  [/\bCross\b/gi, "குறுக்குத்தெரு"],
  [/\bNorth\b/gi, "வடக்கு"],
  [/\bSouth\b/gi, "தெற்கு"],
  [/\bEast\b/gi, "கிழக்கு"],
  [/\bWest\b/gi, "மேற்கு"],
  [/\bCentral\b/gi, "மத்திய"],
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

  // 6. Sub-phrase replacement with safe word-boundary matching for Latin words
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

  // 7. Dynamic Landmark Suffixes for changing stop names (e.g. "Gandhipuram Bus Stand", "Lakshmi Mills Junction")
  for (const [re, val] of landmarkReplacements) {
    if (re.test(result)) {
      result = result.replace(re, val);
      changed = true;
    }
  }

  // 8. Auto-Translation strictly for CHANGING THINGS (New Stops, Routes, and User Names)
  // If the text is an English sentence with grammar words, DO NOT mangle it with phonetic transliteration.
  if (/[a-zA-Z]{2,}/.test(result) && !isEnglishSentence(trimmed)) {
    result = result.replace(/\b[a-zA-Z]{2,}\b/g, (token) => {
      // Don't translate codes like TN-49, ETM-01, RSN-04, 7C, D74
      if (/^[A-Z0-9\-_]+$/i.test(token) && /\d/.test(token)) return token;
      const lower = token.toLowerCase();
      if (lowerDictMap.has(lower)) {
        return lowerDictMap.get(lower)!;
      }
      // If it looks like a transit word or proper noun, transliterate it
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

// 100% Clean English Reversion Engine (Tamil -> English)
export function revertToEnglish(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return rawText;
  if (!/[\u0B80-\u0BFF]/.test(trimmed)) return rawText; // Already English

  // 1. Direct translation memory lookup
  if (translationMemory.has(trimmed)) {
    return rawText.replace(trimmed, translationMemory.get(trimmed)!);
  }

  // 2. Exact reverse dictionary match
  if (reverseDictionary[trimmed]) {
    return rawText.replace(trimmed, reverseDictionary[trimmed]!);
  }

  // 3. Dynamic reverse patterns
  for (const p of reversePatterns) {
    const match = trimmed.match(p.regex);
    if (match) {
      return rawText.replace(trimmed, p.replace(match));
    }
  }

  // 4. Sub-phrase reverse replacement
  let result = rawText;
  for (const [ta, en] of sortedReverseEntries) {
    if (ta.length >= 2 && result.includes(ta)) {
      result = result.split(ta).join(en);
    }
  }

  // 5. If any individual Tamil words remain, reverse each Tamil token
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
  t: (text: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: "en",
  setLang: () => {},
  t: (text: string, fallback?: string) => fallback || text,
});

// WeakMap to safely track original English text per DOM node without polluting DOM objects
const origEnWeakMap = new WeakMap<Node, string>();

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
    let isTranslating = false;
    const hasTamil = (s: string) => /[\u0B80-\u0BFF]/.test(s);

    const handleNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        if (lang === "ta") {
          // Strictly capture original English only if it does NOT contain Tamil
          if (!hasTamil(node.nodeValue)) {
            origEnWeakMap.set(node, node.nodeValue);
            (node as any).__origEn = node.nodeValue;
          } else if ((node as any).__origEn && hasTamil((node as any).__origEn)) {
            // Remove contaminated Tamil stored previously
            delete (node as any).__origEn;
          }

          const original = origEnWeakMap.get(node) || (node as any).__origEn || node.nodeValue;
          const translated = translateText(original);
          if (translated !== node.nodeValue) {
            node.nodeValue = translated;
          }
        } else {
          // Revert cleanly to English
          const orig = origEnWeakMap.get(node) || (node as any).__origEn;
          if (orig && !hasTamil(orig)) {
            node.nodeValue = orig;
          } else if (hasTamil(node.nodeValue)) {
            node.nodeValue = revertToEnglish(node.nodeValue);
          }
          // Clean up so future renders start clean
          delete (node as any).__origEn;
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

        // Translate / Revert element titles (buttons, icons, tooltips)
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

    // Apply translation / reversion across entire DOM tree
    isTranslating = true;
    handleNode(document.body);
    isTranslating = false;

    // Dynamic MutationObserver to catch asynchronous Supabase table loads, modal mounts, dialogs, charts
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

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useAdminI18n(): I18nContextType {
  return useContext(I18nContext);
}
