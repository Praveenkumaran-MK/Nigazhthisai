import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type Language = "en" | "ta";

const STORAGE_KEY = "ngz_conductor_lang";

// Complete Conductor & ETM transit dictionary
export const dictionary: Record<string, string> = {
  // Brand & Roles
  "NIGAZHTHISAI": "நிகழ்த்திசை",
  "Nigazhthisai": "நிகழ்த்திசை",
  "CONDUCTOR": "நடத்துனர்",
  "Conductor": "நடத்துனர்",
  "CONDUCTOR PORTAL": "நடத்துனர் தளம்",
  "Conductor Portal": "நடத்துனர் தளம்",
  "DRIVER": "ஓட்டுநர்",
  "Driver": "ஓட்டுநர்",
  "PASSENGER": "பயணி",
  "Passenger": "பயணி",
  "Sign out": "வெளியேறு",
  "Sign Out": "வெளியேறு",
  "LOGOUT": "வெளியேறு",
  "SIGN IN": "உள்நுழைக",
  "Sign In": "உள்நுழைக",
  "Signing In…": "உள்நுழைகிறது…",
  "Gov ID:": "அரசு எண்:",
  "Gov ID": "அரசு எண்",

  // Conductor Dashboard & Status
  "Ticketing Active": "கட்டணச் சீட்டு செயலில் உள்ளது",
  "Cloud Sync Active": "மேகக்கணி ஒத்திசைவு செயலில் உள்ளது",
  "Offline": "ஆஃப்லைன்",
  "Checking session…": "அமர்வு சரிபார்க்கப்படுகிறது…",
  "Loading conductor dashboard…": "நடத்துனர் பலகை ஏற்றப்படுகிறது…",
  "↻ Refresh": "↻ புதுப்பி",
  "Refresh": "புதுப்பி",
  "Account not linked": "கணக்கு இணைக்கப்படவில்லை",
  "Your login isn't linked to a conductor profile yet. Contact your district admin to finish setting up your account.": "உங்கள் உள்நுழைவு இன்னும் நடத்துனர் சுயவிவரத்துடன் இணைக்கப்படவில்லை. உங்கள் கணக்கை அமைக்க மாவட்ட நிர்வாகியைத் தொடர்பு கொள்ளவும்.",

  // Trip Statuses & Actions
  "TRIP IN PROGRESS": "பயணம் நடைபெறுகிறது",
  "Trip in progress": "பயணம் நடைபெறுகிறது",
  "TRIP COMPLETED": "பயணம் முடிவடைந்தது",
  "Trip completed": "பயணம் முடிவடைந்தது",
  "Trip Complete": "பயணம் முடிவடைந்தது",
  "SCHEDULED": "திட்டமிடப்பட்டது",
  "Scheduled": "திட்டமிடப்பட்டது",
  "ACTIVE": "செயலில் உள்ளது",
  "Active": "செயலில் உள்ளது",
  "COMPLETED": "முடிவடைந்தது",
  "Completed": "முடிவடைந்தது",
  "CANCELLED": "ரத்து செய்யப்பட்டது",
  "Cancelled": "ரத்து செய்யப்பட்டது",
  "START TRIP": "பயணத்தைத் தொடங்கு",
  "Start Trip": "பயணத்தைத் தொடங்கு",
  "END TRIP": "பயணத்தை முடி",
  "End Trip": "பயணத்தை முடி",
  "CONTINUE TRIP": "பயணத்தைத் தொடர்க",
  "Continue Trip": "பயணத்தைத் தொடர்க",
  "VIEW TRIP": "பயணத்தைக் காண்க",
  "View Trip": "பயணத்தைக் காண்க",
  "NEXT STOP": "அடுத்த நிறுத்தம்",
  "Next Stop": "அடுத்த நிறுத்தம்",
  "DEPART STOP": "நிறுத்தத்திலிருந்து புறப்படு",
  "Depart Stop": "நிறுத்தத்திலிருந்து புறப்படு",
  "Route progress": "வழித்தட முன்னேற்றம்",
  "Back to Dashboard": "பலகைக்கு திரும்பு",

  // Metrics & Analytics
  "TODAY'S TRIPS": "இன்றைய பயணங்கள்",
  "Today's Trips": "இன்றைய பயணங்கள்",
  "TICKETS ISSUED": "வழங்கப்பட்ட டிக்கெட்டுகள்",
  "Tickets Issued": "வழங்கப்பட்ட டிக்கெட்டுகள்",
  "PASSENGERS CARRIED": "பயணித்தவர்கள்",
  "Passengers Carried": "பயணித்தவர்கள்",
  "TOTAL REVENUE": "மொத்த வருவாய்",
  "Total Revenue": "மொத்த வருவாய்",
  "CASH REVENUE": "ரொக்க வருவாய்",
  "Cash Revenue": "ரொக்க வருவாய்",
  "DIGITAL REVENUE": "டிஜிட்டல் வருவாய்",
  "Digital Revenue": "டிஜிட்டல் வருவாய்",
  "OCCUPANCY": "பயணிகள் இருப்பு",
  "Occupancy": "பயணிகள் இருப்பு",
  "SEATS FILLED": "இருக்கைகள் நிரம்பின",
  "Seats Filled": "இருக்கைகள் நிரம்பின",

  // Ticketing & Fare Collection
  "ISSUE TICKET": "டிக்கெட் வழங்கு",
  "Issue Ticket": "டிக்கெட் வழங்கு",
  "Issue Cash Ticket": "ரொக்க டிக்கெட் வழங்கு",
  "SELECT DESTINATION STOP": "சேருமிட நிறுத்தத்தைத் தேர்வு செய்க",
  "Select destination stop": "சேருமிட நிறுத்தத்தைத் தேர்வு செய்க",
  "NUMBER OF PASSENGERS": "பயணிகள் எண்ணிக்கை",
  "Number of passengers": "பயணிகள் எண்ணிக்கை",
  "CONCESSION TYPE": "சலுகை வகை",
  "Concession Type": "சலுகை வகை",
  "TOTAL FARE": "மொத்த கட்டணம்",
  "Total Fare": "மொத்த கட்டணம்",
  "PRINT TICKET": "டிக்கெட் அச்சிடுக",
  "Print Ticket": "டிக்கெட் அச்சிடுக",
  "PRINTING…": "அச்சிடப்படுகிறது…",
  "TICKET ISSUED SUCCESSFULLY": "டிக்கெட் வெற்றிகரமாக வழங்கப்பட்டது",
  "Ticket Issued Successfully": "டிக்கெட் வெற்றிகரமாக வழங்கப்பட்டது",
  "CASH COLLECTED": "ரொக்கம் பெறப்பட்டது",
  "Normal": "சாதாரண",
  "Student": "மாணவர் (50% சலுகை)",
  "Student (50% off)": "மாணவர் (50% சலுகை)",
  "Senior Citizen": "மூத்த குடிமக்கள் (50% சலுகை)",
  "Senior Citizen (50% off)": "மூத்த குடிமக்கள் (50% சலுகை)",
  "Monthly Pass": "மாதாந்திர பாஸ்",
  "Freedom Fighter": "தியாகிகள் (இலவசம்)",

  // QR Validation & Scanner
  "OPEN SCANNER": "ஸ்கேனரைத் திற",
  "Open Scanner": "ஸ்கேனரைத் திற",
  "Quick Actions": "விரைவு நடவடிக்கைகள்",
  "VERIFY TICKET QR": "டிக்கெட் க்யூஆர் சரிபார்",
  "Verify Ticket QR": "டிக்கெட் க்யூஆர் சரிபார்",
  "SCAN TICKET": "டிக்கெட்டை ஸ்கேன் செய்",
  "Scan Ticket": "டிக்கெட்டை ஸ்கேன் செய்",
  "SCANNER": "ஸ்கேனர்",
  "Scanner": "ஸ்கேனர்",
  "VALID TICKET": "செல்லுபடியாகும் டிக்கெட்",
  "Valid Ticket": "செல்லுபடியாகும் டிக்கெட்",
  "INVALID TICKET": "செல்லுபடியாகாத டிக்கெட்",
  "Invalid Ticket": "செல்லுபடியாகாத டிக்கெட்",
  "ALREADY SCANNED": "ஏற்கனவே ஸ்கேன் செய்யப்பட்டது",
  "Already Scanned": "ஏற்கனவே ஸ்கேன் செய்யப்பட்டது",
  "EXPIRED TICKET": "காலாவதியான டிக்கெட்",
  "Expired Ticket": "காலாவதியான டிக்கெட்",
  "Point camera at passenger ticket QR": "பயணியின் டிக்கெட் க்யூஆர் மீது கேமராவை வைக்கவும்",
  "Scan Next Ticket": "அடுத்த டிக்கெட்டை ஸ்கேன் செய்",
  "Passenger Details": "பயணி விவரங்கள்",
  "Manual Ticket Validation": "கைமுறை டிக்கெட் சரிபார்ப்பு",
  "Passenger PNR Code": "பயணி PNR குறியீடு",
  "Validate Ticket →": "டிக்கெட்டை சரிபார் →",
  "Align Passenger QR Code": "பயணியின் QR குறியீட்டை நேராக்கவும்",
  "QR Camera": "QR கேமரா",
  "Manual PNR": "கைமுறை PNR",
  "Camera permission denied": "கேமரா அனுமதி மறுக்கப்பட்டது",
  "Enable camera access in your browser settings or switch to Manual PNR mode.": "உங்கள் உலாவி அமைப்புகளில் கேமரா அணுகலை இயக்கவும் அல்லது கைமுறை PNR பயன்முறைக்கு மாறவும்.",
  "No Active Trip Assigned": "செயலில் உள்ள பயணம் எதுவும் ஒதுக்கப்படவில்லை",
  "Please start or select a trip before scanning QR codes, or switch to Manual PNR mode.": "QR குறியீடுகளை ஸ்கேன் செய்வதற்கு முன் ஒரு பயணத்தைத் தொடங்கவும் அல்லது தேர்ந்தெடுக்கவும், அல்லது கைமுறை PNR பயன்முறைக்கு மாறவும்.",

  // Emergency & SOS
  "SOS EMERGENCY": "அவசர SOS",
  "SOS Emergency": "அவசர SOS",
  "HOLD FOR 3 SECONDS TO TRIGGER SOS": "SOS சமிக்ஞைக்கு 3 வினாடிகள் அழுத்தவும்",
  "Hold for 3 seconds to trigger SOS": "SOS சமிக்ஞைக்கு 3 வினாடிகள் அழுத்தவும்",
  "SOS ALARM SENT TO COMMAND CENTER": "கட்டளை மையத்திற்கு SOS எச்சரிக்கை அனுப்பப்பட்டது",
  "SOS CHAT": "SOS அரட்டை",
  "Responder Instructions": "பதிலளிப்பாளர் வழிமுறைகள்",
  "Type message to command center…": "கட்டளை மையத்திற்கு செய்தி தட்டச்சு செய்க…",
  "Send": "அனுப்பு",

  // Pocket Mode & Telemetry
  "POCKET MODE": "பாக்கெட் பயன்முறை",
  "Pocket Mode": "பாக்கெட் பயன்முறை",
  "Double tap screen to unlock": "திறக்க திரையை இருமுறை தட்டவும்",
  "OLED Battery Saver Active": "OLED பேட்டரி சேமிப்பு செயலில் உள்ளது",
  "GPS: Watching": "ஜிபிஎஸ்: நேரலை இயக்கம்",
  "GPS: Denied": "ஜிபிஎஸ்: அனுமதி மறுக்கப்பட்டது",
  "GPS: Connecting": "ஜிபிஎஸ்: இணைகிறது",

  // Common Transit Terms
  "Stops": "நிறுத்தங்கள்",
  "Stop": "நிறுத்தம்",
  "Routes": "வழித்தடங்கள்",
  "Route": "வழித்தடம்",
  "Buses": "பேருந்துகள்",
  "Bus": "பேருந்து",
  "Fare": "கட்டணம்",
  "Tickets": "டிக்கெட்டுகள்",
  "Ticket": "டிக்கெட்",
  "Pass": "பாஸ்",
  "From": "இருந்து",
  "To": "வரை",
  "Via": "வழியாக",
  "ETA": "வருகை நேரம்",
  "Arrival": "வருகை",
  "Departure": "புறப்பாடு",
  "Platform": "நடைமேடை",
  "Actions": "செயல்கள்",
  "Close": "மூடு",
  "Cancel": "ரத்து செய்",
  "Confirm": "உறுதி செய்",
  "Save": "சேமி",
  "Back": "பின்செல்",
  "Railway Station": "ரயில் நிலையம்",
  "Bus Stand": "பேருந்து நிலையம்",
  "New Bus Stand": "புதிய பேருந்து நிலையம்",
  "Old Bus Stand": "பழைய பேருந்து நிலையம்",
  "Thanjavur": "தஞ்சாவூர்",
  "Karanthai": "கரந்தை",
  "Vallam": "வல்லம்",
  "Medical College": "மருத்துவக் கல்லூரி",
};

// Automatically build reverse dictionary
export const reverseDictionary: Record<string, string> = {};
for (const [en, ta] of Object.entries(dictionary)) {
  if (!reverseDictionary[ta]) {
    reverseDictionary[ta] = en;
  }
}

// Case-insensitive lookup map
const lowerDictMap = new Map<string, string>();
for (const [en, ta] of Object.entries(dictionary)) {
  lowerDictMap.set(en.toLowerCase(), ta);
}

// Dynamic Translation Memory for clean English reversion
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
    regex: /^Trip #([A-Za-z0-9-_]+)$/i,
    replace: (m) => `பயணம் #${m[1]}`,
  },
  {
    regex: /^Bus #([A-Za-z0-9-_]+)$/i,
    replace: (m) => `பேருந்து #${m[1]}`,
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
    regex: /^(\d+)\s+tickets?$/i,
    replace: (m) => `${m[1]} டிக்கெட்டுகள்`,
  },
  {
    regex: /^(\d+)\s+seats left$/i,
    replace: (m) => `${m[1]} இருக்கைகள் மீதம்`,
  },
  {
    regex: /^(\d+)\s+stops?$/i,
    replace: (m) => `${m[1]} நிறுத்தங்கள்`,
  },
  {
    regex: /^₹\s*(\d+(?:\.\d+)?)$/i,
    replace: (m) => `₹${m[1]}`,
  },
];

// Reverse regex patterns
const reversePatterns: Array<{ regex: RegExp; replace: (match: RegExpMatchArray) => string }> = [
  {
    regex: /^பயணம்\s*#([A-Za-z0-9-_]+)$/i,
    replace: (m) => `Trip #${m[1]}`,
  },
  {
    regex: /^பேருந்து\s*#([A-Za-z0-9-_]+)$/i,
    replace: (m) => `Bus #${m[1]}`,
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
    regex: /^(\d+)\s+டிக்கெட்டுகள்$/i,
    replace: (m) => `${m[1]} tickets`,
  },
  {
    regex: /^(\d+)\s+இருக்கைகள் மீதம்$/i,
    replace: (m) => `${m[1]} seats left`,
  },
  {
    regex: /^(\d+)\s+நிறுத்தங்கள்$/i,
    replace: (m) => `${m[1]} stops`,
  },
];

// Sort dictionary keys by length descending
const sortedEntries = Object.entries(dictionary).sort(
  (a, b) => b[0].length - a[0].length
);

const sortedReverseEntries = Object.entries(reverseDictionary).sort(
  (a, b) => b[0].length - a[0].length
);

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Phonetic Transliteration Engine for new stop/route names
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

  // 4. Trailing punctuation handling
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

  // 5. Corridor & Route decomposition templates
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
  "this", "that", "these", "those", "your", "its", "our", "their", "please", "cannot", "could", "would"
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

  // 6. Sub-phrase replacement with safe word-boundary matching
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

  // 7. Dynamic Landmark Suffixes for changing stop names
  for (const [re, val] of landmarkReplacements) {
    if (re.test(result)) {
      result = result.replace(re, val);
      changed = true;
    }
  }

  // 8. Auto-Translation strictly for CHANGING THINGS (New Stops, Routes, and User Names)
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

// 100% Clean English Reversion Engine (Tamil -> English)
export function revertToEnglish(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return rawText;
  if (!/[\u0B80-\u0BFF]/.test(trimmed)) return rawText;

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

interface ConductorI18nContextType {
  lang: Language;
  setLang: (l: Language) => void;
  t: (text: string, fallback?: string) => string;
}

const ConductorI18nContext = createContext<ConductorI18nContextType>({
  lang: "en",
  setLang: () => {},
  t: (text: string, fallback?: string) => fallback || text,
});

const origEnWeakMap = new WeakMap<Node, string>();

export function ConductorI18nProvider({ children }: { children: ReactNode }) {
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
      console.warn("Could not save conductor language to localStorage:", e);
    }
  }, []);

  const t = useCallback(
    (text: string, fallback?: string): string => {
      if (lang === "en") return fallback || text;
      return translateText(text) || fallback || text;
    },
    [lang],
  );

  // Global Automatic DOM Translator for Conductor PWA
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

  return (
    <ConductorI18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </ConductorI18nContext.Provider>
  );
}

export function useConductorI18n(): ConductorI18nContextType {
  return useContext(ConductorI18nContext);
}
