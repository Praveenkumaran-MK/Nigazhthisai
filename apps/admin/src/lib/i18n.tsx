import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type Language = "en" | "ta";

const STORAGE_KEY = "ngz_admin_lang";

// Complete, comprehensive bilingual dictionary (over 800 transit & operational UI terms)
export const dictionary: Record<string, string> = {
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
  "Search stops...": "நிறுத்தங்களைத் தேடுக...",
  "Search routes...": "வழித்தடங்களைத் தேடுக...",
  "Search corridors by name, code, or number...": "வழித்தடங்களைத் தேடுக...",
  "Search by Registration No or ETM ID...": "பதிவு எண் அல்லது இடிஎம் ஐடி மூலம் தேடுக...",
  "Search by Driver or Conductor name...": "ஓட்டுநர் அல்லது நடத்துனர் பெயர் மூலம் தேடுக...",
  "Filter by district...": "மாவட்டம் வாரியாக வடிகட்டுக...",
  "Enter stop name": "நிறுத்தப் பெயரை உள்ளிடுக",
  "Enter route code": "வழித்தடக் குறியீட்டை உள்ளிடுக",
  "Enter bus plate number": "பேருந்து பதிவு எண்ணை உள்ளிடுக",
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
  "Save Changes": "மாற்றங்களைச் சேமி",
  "CLEAR": "அழி",
  "APPLY": "பயன்படுத்து",
  "CONFIRM": "உறுதிப்படுத்து",
  "DOWNLOAD": "பதிவிறக்கு",
  "UPLOAD": "பதிவேற்று",
  "IMPORT": "இறக்குமதி",
  "EXPORT": "ஏற்றுமதி",
  "Search...": "தேடுக...",
  "Done": "முடிந்தது",
  "Print": "அச்சிடு",
  "View": "பார்வை",
  "VIEW": "பார்வை",
  "Move Up": "மேலே நகர்த்து",
  "Move Down": "கீழே நகர்த்து",
  "Remove": "நீக்கு",
  "Remove Stop": "நிறுத்தத்தை நீக்கு",
  "Add": "சேர்க்க",
  "Add Stop": "நிறுத்தம் சேர்க்க",
  "+ Add Stop": "+ நிறுத்தம் சேர்க்க",
  "Add District": "மாவட்டம் சேர்க்க",
  "+ Add District": "+ மாவட்டம் சேர்க்க",
  "Add Conductor": "நடத்துனர் சேர்க்க",
  "+ Add Conductor": "+ நடத்துனர் சேர்க்க",
  "+ Add Bus": "+ பேருந்து சேர்க்க",
  "+ Add Route": "+ வழித்தடம் சேர்க்க",
  "Add District Admin": "மாவட்ட நிர்வாகி சேர்க்க",
  "+ Add District Admin": "+ மாவட்ட நிர்வாகி சேர்க்க",
  "Create Route": "வழித்தடம் உருவாக்குக",
  "Create Administrator": "நிர்வாகியை உருவாக்குக",
  "Create District Administrator": "மாவட்ட நிர்வாகியை உருவாக்குக",
  "Create & Schedule Trip": "பயணத்தை உருவாக்கி திட்டமிடுக",
  "Create New Transit Corridor": "புதிய போக்குவரத்து வழித்தடம் உருவாக்குக",
  "Register": "பதிவு செய்",
  "Register New ETM Device": "புதிய இடிஎம் சாதனத்தைப் பதிவு செய்",
  "Generate QR": "க்யூஆர் குறியீட்டை உருவாக்கு",
  "Regenerate": "மீண்டும் உருவாக்கு",
  "Download PNG": "பிஎன்ஜி பதிவிறக்குக",
  "Update": "புதுப்பி",
  "Update Status": "நிலையைப் புதுப்பி",
  "From:": "தொடக்கம்:",
  "To:": "முடிவு:",
  "When?": "எப்போது?",
  "Current Time": "தற்போதைய நேரம்",
  "Reporting Period": "அறிக்கைக் காலம்",
  "Generated At": "உருவாக்கப்பட்ட நேரம்",
  "Logged At": "பதிவான நேரம்",
  "Raised At": "எழுப்பப்பட்ட நேரம்",
  "Resolved At": "தீர்க்கப்பட்ட நேரம்",
  "Departure Time": "புறப்படும் நேரம்",
  "Departure Time (HH:MM)": "புறப்படும் நேரம் (மணி:நிமிடம்)",
  "Scheduled Departure": "திட்டமிடப்பட்ட புறப்பாடு",
  "Scheduled Arrival": "திட்டமிடப்பட்ட வருகை",
  "Scheduled Arrival (Optional)": "திட்டமிடப்பட்ட வருகை (விருப்பத்தேர்வு)",
  "Scheduled Next": "அடுத்த திட்டமிடல்",
  "Scheduled Start": "திட்டமிடப்பட்ட தொடக்கம்",
  "Expected Time of Arrival (Optional)": "எதிர்பார்க்கப்படும் வருகை நேரம் (விருப்பத்தேர்வு)",
  "Actual:": "உண்மையான நேரம்:",
  "· Actual:": "· உண்மையான நேரம்:",
  "Day": "நாள்",
  "Days": "நாட்கள்",
  "7 Days": "7 நாட்கள்",
  "30 Days": "30 நாட்கள்",
  "90 Days": "90 நாட்கள்",
  "All Time": "எல்லா நேரமும்",
  "All நேரம்": "எல்லா நேரமும்",
  "Custom Range": "தனிப்பயன் வரம்பு",
  "Day of Week": "வாரத்தின் நாள்",
  "Daily": "தினசரி",
  "Standard Daily": "நிலையான தினசரி",
  "STANDARD (DAILY)": "நிலையான தினசரி",
  "STANDARD DAILY": "நிலையான தினசரி",
  "Select Schedule Cadence:": "அட்டவணை சுழற்சியைத் தேர்வு செய்க:",
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
  "Completed Today": "இன்று முடிவடைந்தது",
  "Revenue & Financial Audits": "வருவாய் & நிதி தணிக்கை",
  "Financial Audits": "நிதி தணிக்கை",
  "Real-time financial breakdown, custom date range filtering, digital fare analytics, and branded audit PDF export.": "நேரலை நிதி விவரங்கள், தேதி வரம்பு வடிகட்டுதல், டிஜிட்டல் கட்டண பகுப்பாய்வு மற்றும் தணிக்கை பிடிஎஃப் ஏற்றுமதி.",
  "Export Nigazhthisai PDF": "நிகழ்த்திசை PDF ஏற்றுமதி செய்க",
  "All Operating Districts": "அனைத்து செயல்படும் மாவட்டங்கள்",
  "All Operating": "அனைத்து செயல்படும்",
  "All Operating மாவட்டங்கள்": "அனைத்து செயல்படும் மாவட்டங்கள்",
  "Total Net Revenue": "மொத்த நிகர வருவாய்",
  "TOTAL NET REVENUE": "மொத்த நிகர வருவாய்",
  "TOTAL NET": "மொத்த நிகர",
  "Total Net": "மொத்த நிகர",
  "Net Revenue": "நிகர வருவாய்",
  "NET REVENUE": "மொத்த நிகர வருவாய்",
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
  "Digital Fare": "டிஜிட்டல் கட்டணம்",
  "ADOPTION": "பயன்பாடு",
  "Adoption": "பயன்பாடு",
  "Interactive Revenue Distribution": "ஊடாடும் வருவாய் விநியோகம்",
  "INTERACTIVE REVENUE DISTRIBUTION": "ஊடாடும் வருவாய் விநியோகம்",
  "INTERACTIVE REVENUE DISTRIBUTION (DAY)": "ஊடாடும் வருவாய் விநியோகம் (நாள்)",
  "INTERACTIVE REVENUE DISTRIBUTION (BUS)": "ஊடாடும் வருவாய் விநியோகம் (பேருந்து)",
  "INTERACTIVE REVENUE DISTRIBUTION (ROUTE)": "ஊடாடும் வருவாய் விநியோகம் (வழித்தடம்)",
  "INTERACTIVE REVENUE DISTRIBUTION (CONCESSION)": "ஊடாடும் வருவாய் விநியோகம் (சலுகை)",
  "INTERACTIVE REVENUE DISTRIBUTION (PAYMENT_METHOD)": "ஊடாடும் வருவாய் விநியோகம் (பணம் செலுத்தும் முறை)",
  "INTERACTIVE": "ஊடாடும்",
  "Interactive": "ஊடாடும்",
  "DISTRIBUTION (DAY)": "விநியோகம் (நாள்)",
  "DISTRIBUTION (BUS)": "விநியோகம் (பேருந்து)",
  "DISTRIBUTION (ROUTE)": "விநியோகம் (வழித்தடம்)",
  "DISTRIBUTION": "விநியோகம்",
  "Distribution": "விநியோகம்",
  "Visual comparisons across segments. Hover bars to inspect exact collections.": "பிரிவுகள் முழுவதும் ஒப்பீடுகள். துல்லியமான வசூலை அறிய பார்களின் மீது சுட்டியை வைக்கவும்.",
  "Total Revenue": "மொத்த வருவாய்",
  "TOTAL REVENUE": "மொத்த வருவாய்",
  "Generating visual analytics…": "வரைபட பகுப்பாய்வு உருவாக்கப்படுகிறது…",
  "No revenue data available for selected parameters.": "தேர்ந்தெடுக்கப்பட்ட அளவுகளுக்கு வருவாய் தரவு எதுவும் இல்லை.",
  "By Day": "நாள் வாரியாக",
  "By Bus": "பேருந்து வாரியாக",
  "By Route": "வழித்தடம் வாரியாக",
  "By Concession": "சலுகை வாரியாக",
  "By Payment Method": "பணம் செலுத்தும் முறை வாரியாக",
  "Loading breakdown rows…": "பகுப்பாய்வு வரிசைகள் ஏற்றப்படுகின்றன…",
  "No records found.": "பதிவுகள் எதுவும் காணப்படவில்லை.",
  "tickets": "டிக்கெட்டுகள்",
  "ticket": "டிக்கெட்",
  "Cash": "ரொக்கம்",
  "Digital": "டிஜிட்டல்",
  "UPI": "யுபிஐ",
  "CASH FARE": "ரொக்கக் கட்டணம்",
  "NIGAZHTHISAI TRANSIT SYSTEMS": "நிகழ்த்திசை போக்குவரத்து அமைப்பு",
  "Transit Operations & Financial Revenue Audit Report": "போக்குவரத்து செயல்பாடுகள் & நிதி வருவாய் தணிக்கை அறிக்கை",
  "EXECUTIVE AUDIT SUMMARY": "நிர்வாக தணிக்கைச் சுருக்கம்",
  "District Scope": "மாவட்ட வரம்பு",
  "Revenue Reports & PDF": "வருவாய் அறிக்கைகள் & PDF",
  "Transit Stops & Sequence:": "போக்குவரத்து நிறுத்தங்கள் & வரிசைமுறை:",
  "Transit Stops & Sequence": "போக்குவரத்து நிறுத்தங்கள் & வரிசைமுறை",
  "Transit Stops": "போக்குவரத்து நிறுத்தங்கள்",
  "Transit": "போக்குவரத்து",
  "TRANSIT": "போக்குவரத்து",
  "TRANSIT CORRIDOR": "போக்குவரத்து வழித்தடம்",
  "Transit Corridor": "போக்குவரத்து வழித்தடம்",
  "Configure Corridor": "வழித்தடத்தை உள்ளமைக்க",
  "STOPS ASSIGNED": "நிறுத்தங்கள் ஒதுக்கப்பட்டன",
  "ASSIGNED": "ஒதுக்கப்பட்டது",
  "Assigned": "ஒதுக்கப்பட்டது",
  "Assigned Bus": "ஒதுக்கப்பட்ட பேருந்து",
  "Assigned Conductor": "ஒதுக்கப்பட்ட நடத்துனர்",
  "Add Stop to Corridor:": "வழித்தடத்தில் நிறுத்தம் சேர்க்க:",
  "Add Stop to Corridor": "வழித்தடத்தில் நிறுத்தம் சேர்க்க",
  "Select bus stop to insert…": "சேர்க்க வேண்டிய பேருந்து நிறுத்தத்தைத் தேர்வு செய்க…",
  "Select bus stop to insert...": "சேர்க்க வேண்டிய பேருந்து நிறுத்தத்தைத் தேர்வு செய்க...",
  "No stops configured for this schedule. Add stops using the selector above.": "இந்த அட்டவணைக்கு நிறுத்தங்கள் அமைக்கப்படவில்லை. மேலே உள்ள தேர்வியைப் பயன்படுத்தி நிறுத்தங்களைச் சேர்க்கவும்.",
  "Save Stop Sequence": "நிறுத்த வரிசையைச் சேமி",
  "STOP SEQUENCE": "நிறுத்த வரிசை",
  "Stop Sequence": "நிறுத்த வரிசை",
  "Sequence": "வரிசை",
  "MANAGE STOPS & ETA": "நிறுத்தங்கள் & வருகை நேரத்தை நிர்வகி",
  "Manage Stops & ETA": "நிறுத்தங்கள் & வருகை நேரத்தை நிர்வகி",
  "MANAGE": "நிர்வகி",
  "Manage": "நிர்வகி",
  "ETA": "வருகை நேரம் (ETA)",
  "ETA:": "வருகை நேரம்:",
  "via": "வழியாக",
  "Via": "வழியாக",
  "VIA": "வழியாக",
  "Railway Station": "ரயில் நிலையம்",
  "New Bus Stand": "புதிய பேருந்து நிலையம்",
  "Old Bus Stand": "பழைய பேருந்து நிலையம்",
  "Bus Stand": "பேருந்து நிலையம்",
  "Bus Stop": "பேருந்து நிறுத்தம்",
  "Bus Stops": "பேருந்து நிறுத்தங்கள்",
  "Junction": "சந்திப்பு",
  "Signal": "சமிக்ஞை",
  "Market": "சந்தை",
  "Hospital": "மருத்துவமனை",
  "College": "கல்லூரி",
  "North": "வடக்கு",
  "South": "தெற்கு",
  "East": "கிழக்கு",
  "West": "மேற்கு",
  "Road": "சாலை",
  "Street": "தெரு",
  "Nagar": "நகர்",
  "Corridor": "வழித்தட இணைப்பு",
  "CORRIDOR": "வழித்தட இணைப்பு",
  "Corridors": "வழித்தட இணைப்புகள்",
  "Route paths, stop sequences and waypoints": "வழித்தடப் பாதைகள், நிறுத்த வரிசைகள் மற்றும் வழிப்புள்ளிகள்",
  "Flat fare per origin/destination pair on a route.": "வழித்தடத்தில் புறப்பாடு/சேருமிட இணைக்கான நிலையான கட்டணம்.",
  "Add stops below in the order buses will visit them.": "பேருந்துகள் செல்லும் வரிசையில் கீழே நிறுத்தங்களைச் சேர்க்கவும்.",
  "This stop is already added to this corridor.": "இந்த நிறுத்தம் ஏற்கனவே இந்த வழித்தடத்தில் சேர்க்கப்பட்டுள்ளது.",
  "Ordering here is authoritative for fare lookup and eligible-bus filtering.": "கட்டணக் கணக்கீடு மற்றும் பேருந்து வடிகட்டலுக்கு இந்த வரிசையே முதன்மையானது.",
  "Route Created Successfully": "வழித்தடம் வெற்றிகரமாக உருவாக்கப்பட்டது",
  "Route Updated Successfully": "வழித்தடம் வெற்றிகரமாகப் புதுப்பிக்கப்பட்டது",
  "Route Deleted": "வழித்தடம் நீக்கப்பட்டது",
  "Emergency & SOS Command Desk": "அவசர & SOS கட்டளை மையம்",
  "Command Desk": "கட்டளை மையம்",
  "Continuous real-time incident telemetry, automated 60s idle fleet scanning, and live emergency responder chat.": "தொடர்ச்சியான நேரலை சம்பவ கண்காணிப்பு, 60 வினாடி தானியங்கி வாகன ஸ்கேனிங் மற்றும் நேரலை அவசர பதிலளிப்பாளர் அரட்டை.",
  "Siren Armed (Click to Mute)": "சைரன் இயக்கப்பட்டது (முடக்க கிளிக் செய்க)",
  "Siren Muted (Click to Arm)": "சைரன் முடக்கப்பட்டது (இயக்க கிளிக் செய்க)",
  "Active Alerts": "செயலில் உள்ள எச்சரிக்கைகள்",
  "History & Audit": "வரலாறு & தணிக்கை",
  "Audit Log": "தணிக்கை பதிவு",
  "Audit Status": "தணிக்கை நிலை",
  "Total Active Incidents": "மொத்த செயலில் உள்ள சம்பவங்கள்",
  "TOTAL ACTIVE INCIDENTS": "மொத்த செயலில் உள்ள சம்பவங்கள்",
  "Active Incidents": "செயலில் உள்ள சம்பவங்கள்",
  "Incidents": "சம்பவங்கள்",
  "INCIDENTS": "சம்பவங்கள்",
  "Incident": "சம்பவம்",
  "Critical / SOS Signals": "அவசர / SOS சமிக்ஞைகள்",
  "CRITICAL / SOS SIGNALS": "அவசர / SOS சமிக்ஞைகள்",
  "SOS Signals": "SOS சமிக்ஞைகள்",
  "Signals": "சமிக்ஞைகள்",
  "SIGNALS": "சமிக்ஞைகள்",
  "Requires emergency response": "அவசர நடவடிக்கை தேவைப்படுகிறது",
  "Idle / Stationary Buses": "செயலற்ற / நகராத பேருந்துகள்",
  "IDLE / STATIONARY BUSES": "செயலற்ற / நகராத பேருந்துகள்",
  "IDLE / STATIONARY": "செயலற்ற / நகராத",
  "Idle Buses": "செயலற்ற பேருந்துகள்",
  "Stationary": "நகராத",
  "Idle": "செயலற்ற",
  "Continuous 60s scan active": "தொடர்ச்சியான 60வி ஸ்கேன் செயலில் உள்ளது",
  "System Monitoring": "கணினி கண்காணிப்பு",
  "SYSTEM MONITORING": "கணினி கண்காணிப்பு",
  "Supabase Realtime synchronized": "நேரலை தரவுத்தளம் ஒத்திசைக்கப்பட்டது",
  "SOS triggered by conductor": "நடத்துனரால் தூண்டப்பட்ட SOS",
  "SOS triggered by passenger": "பயணியால் தூண்டப்பட்ட SOS",
  "Acknowledge": "ஏற்றுக்கொள்",
  "ACKNOWLEDGE": "ஏற்றுக்கொள்",
  "Acknowledged": "ஏற்றுக்கொள்ளப்பட்டது",
  "acknowledged": "ஏற்றுக்கொள்ளப்பட்டது",
  "Resolve": "தீர்த்துவை",
  "RESOLVE": "தீர்த்துவை",
  "Resolved": "தீர்க்கப்பட்டது",
  "Responder Chat": "பதிலளிப்பாளர் அரட்டை",
  "Hide Chat": "அரட்டையை மறை",
  "All Sources": "அனைத்து மூலங்களும்",
  "Passenger SOS": "பயணி SOS",
  "Conductor SOS": "நடத்துனர் SOS",
  "Fleet Telemetry": "வாகனத் தொலை அளவியல்",
  "Telemetry": "தொலை அளவியல்",
  "No active alerts": "செயலில் உள்ள எச்சரிக்கைகள் இல்லை",
  "All clear across fleet operations for this filter.": "இந்த வடிப்பானுக்கான அனைத்து வாகன செயல்பாடுகளும் சீராக உள்ளன.",
  "No messages yet. Send instructions below.": "செய்திகள் எதுவும் இல்லை. கீழே வழிமுறைகளை அனுப்பவும்.",
  "Type response instructions…": "பதில் வழிமுறைகளை உள்ளிடவும்…",
  "Send": "அனுப்பு",
  "Unknown bus": "அறியப்படாத பேருந்து",
  "Unknown conductor": "அறியப்படாத நடத்துனர்",
  "Fleet Registration, Depot Status and Buses": "பேருந்து பதிவு, பணிமனை நிலை மற்றும் பேருந்துகள்",
  "Fleet registration, depot status and buses": "பேருந்து பதிவு, பணிமனை நிலை மற்றும் பேருந்துகள்",
  "Fleet Maintenance Console": "பராமரிப்பு மேலாண்மை மையம்",
  "Fleet vehicles, each optionally assigned to a route and operating district.": "ஒவ்வொரு பேருந்தும் விருப்பத்தேர்வாக வழித்தடத்திற்கும் மாவட்டத்திற்கும் ஒதுக்கப்படும்.",
  "Buses in Service": "சேவையில் உள்ள பேருந்துகள்",
  "In-Service Now": "இப்போது சேவையில் உள்ளது",
  "Out of Service": "சேவையில் இல்லை",
  "Under Maintenance": "பராமரிப்பில் உள்ளது",
  "Under Repair": "பழுதுபார்ப்பில் உள்ளது",
  "Decommissioned": "பயன்பாட்டிலிருந்து நீக்கப்பட்டது",
  "Operational / Ready": "செயல்பாட்டுக்குத் தயார்",
  "Operational": "செயல்பாட்டில் உள்ளது",
  "Charging Depot": "மின்னேற்றும் பணிமனை",
  "CHARGING": "மின்னேற்றப்படுகிறது",
  "Battery Level %": "மின்கல அளவு %",
  "Battery %": "மின்கல %",
  "Battery": "மின்கலன்",
  "ETM inventory, maintenance bay and bus QR": "இடிஎம் இருப்பு, பராமரிப்பு மையம் மற்றும் பேருந்து க்யூஆர்",
  "ETM Devices & Live Linking": "இடிஎம் சாதனங்கள் & நேரலை இணைப்பு",
  "Scan to verify bus identity before starting a trip": "பயணத்தைத் தொடங்குவதற்கு முன் பேருந்தின் அடையாளத்தைச் சரிபார்க்க ஸ்கேன் செய்க",
  "Log Maintenance Status": "பராமரிப்பு நிலையைப் பதிவு செய்க",
  "Maintenance Notes / Root Cause": "பராமரிப்புக் குறிப்புகள் / மூலக் காரணம்",
  "Faulty / Hardware Defect": "பழுது / வன்பொருள் குறைபாடு",
  "FAULTY": "பழுதடைந்தது",
  "Inactive Buses & Faulty ETMs": "செயலற்ற பேருந்துகள் & பழுதான இடிஎம்கள்",
  "Assign to Bus": "பேருந்துக்கு ஒதுக்கு",
  "Assign to Conductor": "நடத்துனருக்கு ஒதுக்கு",
  "Unassigned": "ஒதுக்கப்படவில்லை",
  "Linked": "இணைக்கப்பட்டது",
  "Not linked": "இணைக்கப்படவில்லை",
  "None / Unassigned": "எதுவுமில்லை / ஒதுக்கப்படவில்லை",
  "Copy Verification Token / Bus Number": "சரிபார்ப்பு டோக்கன் / பேருந்து எண்ணை நகலெடு",
  "Daily dispatches, trip assigner and timetable": "தினசரி அனுப்புதல்கள், பயண ஒதுக்கீடு மற்றும் கால அட்டவணை",
  "Trips & Live Dispatch": "பயணங்கள் & நேரலை அனுப்புதல்",
  "Schedules & Timetables": "அட்டவணைகள் & கால அட்டவணைகள்",
  "Schedule New Bus Trip": "புதிய பேருந்துப் பயணத்தைத் திட்டமிடுக",
  "Timetable Departures": "கால அட்டவணை புறப்பாடுகள்",
  "Weekday Departure Templates": "வாரநாள் புறப்பாடு மாதிரிகள்",
  "Add Weekday Departure Template": "வாரநாள் புறப்பாடு மாதிரியைச் சேர்க்க",
  "Confirm schedule & assign conductor": "அட்டவணையை உறுதிசெய்து நடத்துனரை ஒதுக்குக",
  "The conductor will see this trip on their dashboard.": "நடத்துனர் இந்த பயணத்தை தங்கள் கட்டுப்பாட்டகத்தில் காண்பார்.",
  "Trip scheduled successfully": "பயணம் வெற்றிகரமாகத் திட்டமிடப்பட்டது",
  "Trip updated successfully": "பயணம் வெற்றிகரமாகப் புதுப்பிக்கப்பட்டது",
  "Trip Duration (Hours)": "பயண கால அளவு (மணிநேரம்)",
  "Estimated Duration (Hours)": "மதிப்பிடப்பட்ட கால அளவு (மணிநேரம்)",
  "Duration (hours)": "கால அளவு (மணிநேரம்)",
  "Live pipeline tracking activates automatically once a conductor starts a scheduled trip.": "நடத்துனர் திட்டமிட்ட பயணத்தைத் தொடங்கியவுடன் நேரலை கண்காணிப்பு தானாகவே செயல்படும்.",
  "Live radar GPS map and active fleet trackers": "நேரலை ரேடார் ஜிபிஎஸ் வரைபடம் மற்றும் வாகனக் கண்காணிப்பாளர்கள்",
  "Busiest Boarding:": "அதிக பயணிகள் ஏறும் நிறுத்தம்:",
  "Busiest Alighting:": "அதிக பயணிகள் இறங்கும் நிறுத்தம்:",
  "Total Booked Pax:": "மொத்த முன்பதிவு செய்த பயணிகள்:",
  "Capacity Load": "இருக்கை நிரப்பளவு",
  "On-Time": "சரியான நேரத்தில்",
  "ON-TIME": "சரியான நேரத்தில்",
  "Delayed": "தாமதமானது",
  "Cancelled": "ரத்து செய்யப்பட்டது",
  "Passenger grievance desk and help queries": "பயணிகள் குறைதீர்ப்பு மையம் மற்றும் உதவி வினவல்கள்",
  "Investigate Grievances": "குறைகளை ஆய்வு செய்க",
  "Total Grievances": "மொத்த புகார்கள்",
  "Resolved Grievances": "தீர்க்கப்பட்ட புகார்கள்",
  "Open & Unresolved": "நிலுவையில் உள்ளவை",
  "Pending Review": "மதிப்பாய்வில் உள்ளவை",
  "Cleanliness & Hygiene": "தூய்மை & சுகாதாரம்",
  "Driver / Crew Conduct": "ஓட்டுநர் / பணியாளர் நடத்தை",
  "Fare Overcharging": "கூடுதல் கட்டணம் வசூலித்தல்",
  "Overcrowding": "அதிக கூட்டம்",
  "Safety & Security": "பாதுகாப்பு & உறுதிப்பாடு",
  "General Grievance": "பொதுவான குறைபாடு",
  "Mark Resolved": "தீர்க்கப்பட்டதாகக் குறிக்க",
  "Incident Details": "சம்பவ விவரங்கள்",
  "Overview and core operational telemetry": "கண்ணோட்டம் மற்றும் முக்கிய செயல்பாட்டு அளவீடுகள்",
  "System Command — All Operating Districts": "அமைப்பு கட்டளை — அனைத்து செயல்படும் மாவட்டங்கள்",
  "Master Command Authority": "முதன்மை கட்டளை அதிகாரம்",
  "Online Ticket Payments": "ஆன்லைன் டிக்கெட் கட்டணம்",
  "Passengers can buy digital tickets via UPI.": "பயணிகள் யுபிஐ மூலம் டிஜிட்டல் டிக்கெட்டுகளை வாங்கலாம்.",
  "Payments are disabled — conductors issue cash tickets only.": "கட்டணங்கள் முடக்கப்பட்டுள்ளன — நடத்துனர்கள் ரொக்க டிக்கெட்டுகளை மட்டுமே வழங்குவர்.",
  "Bulk-load stops, routes, or fares.": "நிறுத்தங்கள், வழித்தடங்கள் அல்லது கட்டணங்களை மொத்தமாகப் பதிவேற்றவும்.",
  "Drag & drop a CSV, or click to browse": "CSV கோப்பை இழுத்துப் போடவும், அல்லது உலாவ கிளிக் செய்யவும்",
  "Across all transit districts": "அனைத்து போக்குவரத்து மாவட்டங்களிலும்",
  "Districts Management": "மாவட்டங்கள் மேலாண்மை",
  "District Jurisdiction": "மாவட்ட எல்லை",
  "District Operations": "மாவட்ட செயல்பாடுகள்",
  "District Fleet Operations": "மாவட்ட வாகன செயல்பாடுகள்",
  "Add New Transit District": "புதிய போக்குவரத்து மாவட்டத்தைச் சேர்க்க",
  "Delete Transit District": "போக்குவரத்து மாவட்டத்தை நீக்கு",
  "Conductors Management": "நடத்துனர்கள் மேலாண்மை",
  "Conductor account created": "நடத்துனர் கணக்கு உருவாக்கப்பட்டது",
  "Conductor profile updated": "நடத்துனர் சுயவிவரம் புதுப்பிக்கப்பட்டது",
  "Delete Administrator": "நிர்வாகியை நீக்கு",
  "Revoke Role": "அனுமதியை ரத்து செய்",
  "ACCESS GRANTED": "அனுமதி வழங்கப்பட்டது",
  "ACCESS REVOKED": "அனுமதி ரத்து செய்யப்பட்டது",
  "Access Revocation Notice": "அனுமதி ரத்து அறிவிப்பு",
  "Select a route": "வழித்தடத்தைத் தேர்வு செய்க",
  "Select a bus": "பேருந்தைத் தேர்வு செய்க",
  "Select a conductor": "நடத்துனரைத் தேர்வு செய்க",
  "Select a stop": "நிறுத்தத்தைத் தேர்வு செய்க",
  "Select district": "மாவட்டத்தைத் தேர்வு செய்க",
  "Select district (optional)…": "மாவட்டத்தைத் தேர்வு செய்க (விருப்பத்தேர்வு)…",
  "Select ETM Device": "இடிஎம் சாதனத்தைத் தேர்வு செய்க",
  "Select Bus": "பேருந்தைத் தேர்வு செய்க",
  "Select Bus:": "பேருந்தைத் தேர்வு செய்க:",
  "All Categories": "அனைத்து வகைகள்",
  "All Severities": "அனைத்து தீவிர நிலைகளும்",
  "All Statuses": "அனைத்து நிலைகளும்",
  "All Clear": "அனைத்தும் சீராக உள்ளது",
  "Choose date & time": "தேதி & நேரத்தைத் தேர்வு செய்க",
  "Search bus number / reg…": "பேருந்து எண் / பதிவை தேடுக…",
  "Search bus, title, message…": "பேருந்து, தலைப்பு, செய்தியை தேடுக…",
  "10-digit mobile number": "10-இலக்க மொபைல் எண்",
  "Full display name": "முழு பெயர்",
  "Display Name": "காட்சிப் பெயர்",
  "Display name": "காட்சிப் பெயர்",
  "Phone Number *": "தொலைபேசி எண் *",
  "Government ID": "அரசு அடையாள எண்",
  "Serial Number *": "வரிசை எண் *",
  "Assignment Notes (Optional)": "ஒதுக்கீட்டுக் குறிப்புகள் (விருப்பத்தேர்வு)",
  "Reason for Modification": "மாற்றத்திற்கான காரணம்",
  "Notes": "குறிப்புகள்",
  "Coordinates": "புவியியல் ஆயங்கள்",
  "Latitude": "அட்சரேகை (Latitude)",
  "Longitude": "தீர்க்கரேகை (Longitude)",
  "Origin": "புறப்படும் இடம்",
  "Destination": "சேருமிடம்",
  "Origin stop": "புறப்படும் நிறுத்தம்",
  "Destination stop": "சேரும் நிறுத்தம்",
  "Stop code": "நிறுத்தக் குறியீடு",
  "Bus number": "பேருந்து எண்",
  "Bus Vehicle": "பேருந்து வாகனம்",
  "Total Fleet": "மொத்த பேருந்துக் குழு",
  "Total Roster": "மொத்தப் பட்டியல்",
  "Total Logged": "மொத்தம் பதிவானவை",
  "Severity": "தீவிரம்",
  "Source": "மூலம்",
  "Warning": "எச்சரிக்கை",
  "Info": "தகவல்",
  "Faulty": "பழுதடைந்தது",
  "Offline": "இணைப்பற்றது",
  "OFFLINE": "இணைப்பற்றது",
  "Offline Storage": "இணைப்பற்ற சேமிப்பு",
  "Synced": "ஒத்திசைக்கப்பட்டது",
  "Valid": "செல்லுபடியாகும்",
  "Tamil Nadu": "தமிழ்நாடு",
  "TOTAL": "மொத்த",
  "Total": "மொத்த",
  "NET": "நிகர",
  "Net": "நிகர",
  "TICKETS": "டிக்கெட்டுகள்",
  "Tickets": "டிக்கெட்டுகள்",
  "TICKET": "டிக்கெட்",
  "Ticket": "டிக்கெட்",
  "AVERAGE": "சராசரி",
  "Average": "சராசரி",
  "FARE": "கட்டணம்",
  "DIGITAL": "டிஜிட்டல்",
  "STOP": "நிறுத்தம்",
  "Stop": "நிறுத்தம்",
  "CADENCE": "சுழற்சி",
  "Cadence": "சுழற்சி",
  "SEQUENCE": "வரிசைமுறை",
  "EMERGENCY": "அவசர",
  "Emergency": "அவசர",
  "COMMAND": "கட்டளை",
  "Command": "கட்டளை",
  "DESK": "மையம்",
  "Desk": "மையம்",
  "INCIDENT": "சம்பவம்",
  "SIGNAL": "சமிக்ஞை",
  "IDLE": "செயலற்ற",
  "STATIONARY": "நகராத",
  "BUS": "பேருந்து",
  "Bus": "பேருந்து",
  "ROUTE": "வழித்தடம்",
  "Route": "வழித்தடம்",
  "TRIP": "பயணம்",
  "Trip": "பயணம்",
  "DAYS": "நாட்கள்",
  "DAY": "நாள்",
  "TIME": "நேரம்",
  "OPERATING": "செயல்படும்",
  "Operating": "செயல்படும்",
  "ALERTS": "எச்சரிக்கைகள்",
  "Alerts": "எச்சரிக்கைகள்",
  "ALERT": "எச்சரிக்கை",
  "Alert": "எச்சரிக்கை",
  "HISTORY": "வரலாறு",
  "History": "வரலாறு",
  "AUDIT": "தணிக்கை",
  "Audit": "தணிக்கை",
  "SIREN": "சைரன்",
  "Siren": "சைரன்",
  "MUTED": "முடக்கப்பட்டது",
  "Muted": "முடக்கப்பட்டது",
  "ARMED": "இயக்கப்பட்டது",
  "Armed": "இயக்கப்பட்டது",
  "CLICK": "கிளிக் செய்க",
  "Click": "கிளிக் செய்க",
  "RESPONDER": "பதிலளிப்பாளர்",
  "Responder": "பதிலளிப்பாளர்",
  "CHAT": "அரட்டை",
  "Chat": "அரட்டை",
  "SELECT": "தேர்வு செய்க",
  "Select": "தேர்வு செய்க",
  "INSERT": "சேர்க்க",
  "Insert": "சேர்க்க",
  "STANDARD": "நிலையான",
  "Standard": "நிலையான",
  "NORTH": "வடக்கு",
  "SOUTH": "தெற்கு",
  "EAST": "கிழக்கு",
  "WEST": "மேற்கு",
  "STATION": "நிலையம்",
  "Station": "நிலையம்",
  "STAND": "நிலையம்",
  "Stand": "நிலையம்",
  "MARKET": "சந்தை",
  "JUNCTION": "சந்திப்பு",
  "COLLEGE": "கல்லூரி",
  "HOSPITAL": "மருத்துவமனை",
  "Passenger": "பயணி",
  "DRIVER": "ஓட்டுநர்",
  "TELEMETRY": "தொலை அளவியல்",
  "Karanthai": "கரந்தை",
  "Vallam": "வல்லம்",
  "Thanjai": "தஞ்சை",
  "Medical College": "மருத்துவக் கல்லூரி",
  "Medical College Junction": "மருத்துவக் கல்லூரி சந்திப்பு",
  "Railway Station North": "ரயில் நிலையம் வடக்கு",
  "Vallam Road Market": "வல்லம் சாலை சந்தை",
  "Karanthai Signal": "கரந்தை சிக்னல்",
  "Thanjavur New Bus Stand to Thanjavur Old Bus Stand": "தஞ்சாவூர் புதிய பேருந்து நிலையம் முதல் தஞ்சாவூர் பழைய பேருந்து நிலையம் வரை",
  "Thanjavur New Bus Stand": "தஞ்சாவூர் புதிய பேருந்து நிலையம்",
  "Thanjavur Old Bus Stand": "தஞ்சாவூர் பழைய பேருந்து நிலையம்",
  "Click to Arm": "இயக்க கிளிக் செய்க",
  "Click to Mute": "முடக்க கிளிக் செய்க"
};

// Complete reverse dictionary (Tamil to English) for 100% clean English reversion
export const reverseDictionary: Record<string, string> = {
  "நிகழ்த்திசை": "NIGAZHTHISAI",
  "முதன்மை நிர்வாகி": "MASTER ADMIN",
  "மாவட்ட நிர்வாகி": "DISTRICT ADMIN",
  "முதன்மை": "MASTER",
  "நிர்வாகம்": "ADMIN",
  "நடத்துனர்": "CONDUCTOR",
  "பயணி": "PASSENGER",
  "நிர்வாக தளம்": "MANAGEMENT PORTAL",
  "பின்செல்": "BACK",
  "வெளியேறு": "Sign out",
  "உள்நுழைக": "SIGN IN",
  "உள்நுழைகிறது…": "SIGNING IN…",
  "கடவுச்சொல் மறந்துவிட்டதா? நிர்வாகியைத் தொடர்பு கொள்ளவும்": "FORGOT PASSWORD? CONTACT ADMINISTRATOR",
  "செயல்பாடுகள்": "Operations",
  "கண்காணிப்பு": "Monitoring",
  "நிதி மேலாண்மை": "Finance",
  "பராமரிப்பு": "Maintenance",
  "முதன்மை கட்டுப்பாடு": "System Control",
  "கட்டுப்பாட்டகம்": "Dashboard",
  "நேரலை கண்காணிப்பு": "Live Monitoring",
  "நேரலை பைப்லைன் கண்காணிப்பு": "Live Pipeline Tracking",
  "செயலற்ற & எச்சரிக்கைகள்": "Idle & Alerts",
  "செயல்பாட்டு எச்சரிக்கைகள்": "Operational Alerts",
  "நிறுத்தங்கள்": "Stops",
  "வழித்தடங்கள்": "Routes",
  "வழித்தட நிறுத்தங்கள்": "Route Stops",
  "பேருந்துகள் & இடிஎம்": "Buses & ETM",
  "பேருந்துகள்": "Buses",
  "பயணங்கள் & அட்டவணைகள்": "Trips & Schedules",
  "பயணங்கள்": "Trips",
  "அட்டவணை மேட்ரிக்ஸ்": "Schedules Matrix",
  "கால அட்டவணைகள்": "Schedules",
  "டிக்கெட்டுகள் & வருவாய்": "Tickets & Revenue",
  "வருவாய் பகுப்பாய்வு": "Revenue Analytics",
  "வருவாய்": "Revenue",
  "கட்டண மேட்ரிக்ஸ்": "Fares Matrix",
  "கட்டணங்கள்": "Fares",
  "நடத்துனர்கள் பட்டியல்": "Conductors Directory",
  "நடத்துனர்கள்": "Conductors",
  "புகார்கள் & குறைதீர்ப்பு": "Complaints & Grievance",
  "பயணிகள் புகார்கள்": "Passenger Complaints",
  "புகார்கள்": "Complaints",
  "பராமரிப்பு மேலாண்மை": "Fleet & ETM Maintenance",
  "பேருந்துக் குழு": "Fleet",
  "இடிஎம் சாதனங்கள்": "ETM Devices",
  "பேருந்து க்யூஆர்": "Bus QR Codes",
  "மாவட்டங்கள்": "Districts",
  "பயனர்கள் & பாத்திரங்கள்": "Users & Roles",
  "நிர்வாகப் பயனர்கள்": "Admin Users",
  "அமைப்பு அமைப்புகள்": "System Settings",
  "சிஎஸ்வி பதிவேற்றம்": "CSV Import",
  "வடிப்பான்கள்": "FILTERS",
  "இருப்பிடத்தின்படி தரவை வடிகட்டுக": "REFINE DASHBOARD DATA BY LOCATION",
  "மாவட்டம்": "DISTRICT",
  "அனைத்து மாவட்டங்கள்": "ALL DISTRICTS",
  "மண்டலம்": "ZONE",
  "அனைத்து மண்டலங்கள்": "ALL ZONES",
  "வடக்கு மண்டலம்": "NORTH ZONE",
  "தெற்கு மண்டலம்": "SOUTH ZONE",
  "மத்திய மண்டலம்": "CENTRAL ZONE",
  "மேற்கு மண்டலம்": "WEST ZONE",
  "கிழக்கு மண்டலம்": "EAST ZONE",
  "சென்னை": "CHENNAI",
  "கோயம்புத்தூர்": "COIMBATORE",
  "மதுரை": "MADURAI",
  "சேலம்": "SALEM",
  "திருப்பூர்": "TIRUPPUR",
  "திருச்சிராப்பள்ளி": "TIRUCHIRAPPALLI",
  "ஈரோடு": "ERODE",
  "வேலூர்": "VELLORE",
  "திண்டுக்கல்": "DINDIGUL",
  "தஞ்சாவூர்": "THANJAVUR",
  "திருநெல்வேலி": "TIRUNELVELI",
  "காஞ்சிபுரம்": "KANCHIPURAM",
  "கடலூர்": "CUDDALORE",
  "கரூர்": "KARUR",
  "நாகர்கோவில்": "NAGERCOIL",
  "ஓசூர்": "HOSUR",
  "அவிநாசி": "AVINASHI",
  "காந்திபுரம்": "GANDHIPURAM",
  "உக்கடம்": "UKKADAM",
  "சிங்காநல்லூர்": "SINGANALLUR",
  "பீளமேடு": "PEELAMEDU",
  "கோயம்பேடு": "KOYAMBEDU",
  "தாம்பரம்": "TAMBARAM",
  "கிண்டி": "GUINDY",
  "சென்ட்ரல்": "CENTRAL",
  "எழும்பூர்": "EGMORE",
  "இன்றைய வருவாய்": "Today's Revenue",
  "மொத்த டிக்கெட்டுகள்": "Total Tickets",
  "செயலில் உள்ள பயணங்கள்": "Active Trips",
  "மொத்த பயணிகள்": "Total Passengers",
  "நிகழ்த்திசை — தலைமை கட்டுப்பாட்டு மையம்": "Nigazhthisai — Executive Mission Control",
  "நேரலை தொலை அளவியல் துடிப்பு, உயர்நிலை செயல்பாட்டு சிறப்பம்சங்கள் மற்றும் அனைத்து தொகுதிகளுக்கும் விரைவான அணுகல்": "Real-time telemetry pulse, high-level operational highlights, and rapid access across all modules",
  "செயல்பாட்டுப் பிரிவின் சிறப்பம்சங்கள்": "Operational Section Highlights",
  "நேரலை நிலை சுருக்கம் · விரிவாகப் பார்க்க எந்த தொகுதியையும் கிளிக் செய்க": "Real-time status snapshot · Click any module to deep-dive",
  "வழித்தட பயணிகள் தேவை & கூடுதல் பேருந்து நுண்ணறிவு": "Corridor Passenger Demand & Surge Intelligence",
  "பயணிகள் முன்பதிவுகளிலிருந்து தானியங்கி தேவை ஒருங்கிணைப்பு. உச்ச நிறுத்த அடர்த்தியை முன்னிலைப்படுத்தி பேருந்து ஒதுக்கீட்டைப் பரிந்துரைக்கிறது.": "Automated demand aggregation from passenger bookings. Highlights peak stop density and suggests fleet adjustments.",
  "நேரலையில் கணக்கிடப்பட்டது": "Computed Live",
  "வலையமைப்பு பாதுகாப்பு புள்ளிகள்": "Network Coverage Points",
  "மொத்த வழித்தடங்கள்": "Total Routes",
  "சேவையில் செயலில் உள்ளது": "Active in Service",
  "செயல்பாட்டு விகிதம்": "Operating Rate",
  "உயர் நம்பகத்தன்மை நிலை": "High Reliability Status",
  "சேவையளிக்கப்பட்ட மாவட்டங்கள்": "Districts Served",
  "மொத்தத்தில்": "Across",
  "கிடைக்கக்கூடியவை": "Available",
  "நிலையான தினசரி வழித்தடம் செயலில் உள்ளது": "STANDARD ROUTE ACTIVE",
  "ஞாயிற்றுக்கிழமைக்கான சிறப்பு வழித்தடம் செயலில் உள்ளது": "CUSTOM ROUTE ACTIVE FOR SUNDAY",
  "செயலில் உள்ள போக்குவரத்து நிறுத்தம்": "ACTIVE TRANSIT STOP",
  "வழித்தட வாரியான வருவாய்": "REVENUE BY ROUTE",
  "முன்பதிவு வழிகள்": "BOOKING CHANNELS",
  "மொபைல் செயலி": "Mobile App",
  "இடிஎம் சாதனம்": "ETM Device",
  "செயலி பங்கு": "APP SHARE",
  "அறிக்கையைப் பார்க்க": "VIEW REPORT",
  "நேரலை பைப்லைன் திறக்க": "Open Pipeline Tracker",
  "எச்சரிக்கைகளை ஆராய்க": "Investigate Alerts",
  "நேரலை பைப்லைனை ஆய்வு செய்க": "Inspect Live Pipeline",
  "வழித்தடங்கள் & நேரங்களை நிர்வகிக்க": "Manage Routes & ETAs",
  "பயண அட்டவணைகள் & பதிவுகளைப் பார்க்க": "View Trip Schedules & Logs",
  "நடத்துனர்களை நிர்வகிக்க": "Manage Conductors",
  "அட்டவணைகள் & பேருந்து ஒதுக்கீட்டை நிர்வகிக்க": "Manage Schedules & Fleet Allocation",
  "வழித்தடம் உருவாக்குக": "CREATE ROUTE",
  "புதிய வழித்தடம்": "New Route",
  "அமைவு வழிகாட்டியைத் தொடங்குக": "START SETUP WIZARD",
  "புதிய பேருந்து அமை": "SETUP NEW BUS",
  "பேருந்து சேர்க்க": "ADD BUS",
  "வழித்தடம் சேர்க்க": "ADD ROUTE",
  "புதிய நிறுத்தம் உருவாக்குக": "CREATE NEW STOP",
  "புதிய வழித்தடம் உருவாக்குக": "CREATE NEW ROUTE",
  "புதிய பேருந்து உருவாக்குக": "CREATE NEW BUS",
  "புதிய பயணம் உருவாக்குக": "CREATE NEW TRIP",
  "புதியது உருவாக்குக": "Create New",
  "கார்டுகள்": "Cards",
  "அட்டவணை": "SCHEDULE",
  "செயல்கள்": "ACTIONS",
  "திருத்து": "Edit",
  "நீக்கு": "Delete",
  "சேமி": "Save",
  "ரத்து செய்": "Cancel",
  "சமர்ப்பி": "Submit",
  "மூடு": "Close",
  "புதுப்பி": "Refresh",
  "தேடுக": "Search",
  "அழி": "Clear",
  "பயன்படுத்து": "Apply",
  "உறுதிப்படுத்து": "Confirm",
  "பதிவிறக்கு": "Download",
  "பதிவேற்று": "Upload",
  "இறக்குமதி": "Import",
  "ஏற்றுமதி": "Export",
  "இப்பதிவை நீக்கவா?": "Delete this record?",
  "இந்த செயலை மாற்ற முடியாது.": "This action cannot be undone.",
  "ஏற்றுகிறது...": "Loading...",
  "ஏற்றுகிறது": "Loading",
  "வழித்தடங்கள் ஏற்றப்படுகின்றன…": "Loading corridors…",
  "நிறுத்தங்களைத் தேடுக...": "Search stops...",
  "வழித்தடங்களைத் தேடுக...": "Search corridors by name, code, or number...",
  "பதிவு எண் அல்லது இடிஎம் ஐடி மூலம் தேடுக...": "Search by Registration No or ETM ID...",
  "ஓட்டுநர் அல்லது நடத்துனர் பெயர் மூலம் தேடுக...": "Search by Driver or Conductor name...",
  "மாவட்டம் வாரியாக வடிகட்டுக...": "Filter by district...",
  "நிறுத்தப் பெயரை உள்ளிடுக": "Enter stop name",
  "வழித்தடக் குறியீட்டை உள்ளிடுக": "Enter route code",
  "பேருந்து பதிவு எண்ணை உள்ளிடுக": "Enter bus plate number",
  "நிறுத்த ஐடி": "STOP ID",
  "நிறுத்தப் பெயர்": "STOP NAME",
  "புவியியல் ஆயங்கள் (அட்சம், தீர்க்கம்)": "COORDINATES (LAT, LNG)",
  "வழித்தட ஐடி": "ROUTE ID",
  "வழித்தடப் பெயர்": "ROUTE NAME",
  "குறியீடு": "CODE",
  "இயங்கு அட்டவணை": "DYNAMIC SCHEDULE",
  "நிலை": "STATUS",
  "அட்டவணையைப் பார்க்க": "VIEW SCHEDULE",
  "பேருந்து விவரம்": "BUS INFO",
  "வகை": "TYPE",
  "கட்டுப்பாட்டு நிர்வாகி": "CONTROLLING ADMIN",
  "பயண விவரம்": "TRIP INFO",
  "பணியாளர்கள்": "STAFF",
  "இருக்கை நிரப்பளவு": "Capacity Load",
  "முழுமையானது": "Full",
  "இருக்கைகள்": "Seats",
  "இருக்கைகள் மீதம்": "seats left",
  "ஓட்டுநர்": "Driver",
  "பதிவு எண்": "Plate",
  "பணிமனை": "Depot",
  "கொள்ளளவு": "Capacity",
  "கட்டணம்": "Fare",
  "தூரம்": "Distance",
  "பயண நேரம்": "Duration",
  "மின்னஞ்சல் முகவரி": "EMAIL ADDRESS",
  "கடவுச்சொல்": "PASSWORD",
  "பணிப்பொறுப்பு": "Role",
  "பெயர்": "Name",
  "தொலைபேசி": "Phone",
  "தேதி": "Date",
  "நேரம்": "Time",
  "செயலில் உள்ளது": "ACTIVE",
  "ஓடிக்கொண்டிருக்கிறது": "RUNNING",
  "திட்டமிடப்பட்டுள்ளது": "SCHEDULED",
  "முடிவடைந்தது": "COMPLETED",
  "பராமரிப்பில் உள்ளது": "Under Maintenance",
  "செயலற்றது": "INACTIVE",
  "தூண்டப்பட்டது": "TRIGGERED",
  "ஏற்றுக்கொள்ளப்பட்டது": "ACKNOWLEDGED",
  "தீர்க்கப்பட்டது": "RESOLVED",
  "சாதாரண": "NORMAL",
  "அதிமுக்கிய": "HIGH",
  "அவசர": "EMERGENCY",
  "குளிரூட்டப்பட்டது (AC)": "AC",
  "சாதாரண பேருந்து (Non-AC)": "NON-AC",
  "விரைவு": "EXPRESS",
  "டீலக்ஸ்": "DELUXE",
  "சாதாரண கட்டணம்": "ORDINARY",
  "மாற்றங்களைச் சேமி": "Save Changes",
  "தேடுக...": "Search...",
  "முடிந்தது": "Done",
  "அச்சிடு": "Print",
  "பார்வை": "View",
  "மேலே நகர்த்து": "Move Up",
  "கீழே நகர்த்து": "Move Down",
  "நிறுத்தத்தை நீக்கு": "Remove Stop",
  "சேர்க்க": "INSERT",
  "நிறுத்தம் சேர்க்க": "Add Stop",
  "+ நிறுத்தம் சேர்க்க": "+ Add Stop",
  "மாவட்டம் சேர்க்க": "Add District",
  "+ மாவட்டம் சேர்க்க": "+ Add District",
  "நடத்துனர் சேர்க்க": "Add Conductor",
  "+ நடத்துனர் சேர்க்க": "+ Add Conductor",
  "+ பேருந்து சேர்க்க": "+ Add Bus",
  "+ வழித்தடம் சேர்க்க": "+ Add Route",
  "மாவட்ட நிர்வாகி சேர்க்க": "Add District Admin",
  "+ மாவட்ட நிர்வாகி சேர்க்க": "+ Add District Admin",
  "நிர்வாகியை உருவாக்குக": "Create Administrator",
  "மாவட்ட நிர்வாகியை உருவாக்குக": "Create District Administrator",
  "பயணத்தை உருவாக்கி திட்டமிடுக": "Create & Schedule Trip",
  "புதிய போக்குவரத்து வழித்தடம் உருவாக்குக": "Create New Transit Corridor",
  "பதிவு செய்": "Register",
  "புதிய இடிஎம் சாதனத்தைப் பதிவு செய்": "Register New ETM Device",
  "க்யூஆர் குறியீட்டை உருவாக்கு": "Generate QR",
  "மீண்டும் உருவாக்கு": "Regenerate",
  "பிஎன்ஜி பதிவிறக்குக": "Download PNG",
  "நிலையைப் புதுப்பி": "Update Status",
  "தொடக்கம்:": "From:",
  "முடிவு:": "To:",
  "எப்போது?": "When?",
  "தற்போதைய நேரம்": "Current Time",
  "அறிக்கைக் காலம்": "Reporting Period",
  "உருவாக்கப்பட்ட நேரம்": "Generated At",
  "பதிவான நேரம்": "Logged At",
  "எழுப்பப்பட்ட நேரம்": "Raised At",
  "தீர்க்கப்பட்ட நேரம்": "Resolved At",
  "புறப்படும் நேரம்": "Departure Time",
  "புறப்படும் நேரம் (மணி:நிமிடம்)": "Departure Time (HH:MM)",
  "திட்டமிடப்பட்ட புறப்பாடு": "Scheduled Departure",
  "திட்டமிடப்பட்ட வருகை": "Scheduled Arrival",
  "திட்டமிடப்பட்ட வருகை (விருப்பத்தேர்வு)": "Scheduled Arrival (Optional)",
  "அடுத்த திட்டமிடல்": "Scheduled Next",
  "திட்டமிடப்பட்ட தொடக்கம்": "Scheduled Start",
  "எதிர்பார்க்கப்படும் வருகை நேரம் (விருப்பத்தேர்வு)": "Expected Time of Arrival (Optional)",
  "உண்மையான நேரம்:": "Actual:",
  "· உண்மையான நேரம்:": "· Actual:",
  "நாள்": "Day",
  "நாட்கள்": "Days",
  "7 நாட்கள்": "7 Days",
  "30 நாட்கள்": "30 Days",
  "90 நாட்கள்": "90 Days",
  "எல்லா நேரமும்": "All Time",
  "தனிப்பயன் வரம்பு": "Custom Range",
  "வாரத்தின் நாள்": "Day of Week",
  "தினசரி": "Daily",
  "நிலையான தினசரி": "Standard Daily",
  "அட்டவணை சுழற்சியைத் தேர்வு செய்க:": "Select Schedule Cadence:",
  "ஞாயிறு": "Sunday",
  "திங்கள்": "Monday",
  "செவ்வாய்": "Tuesday",
  "புதன்": "Wednesday",
  "வியாழன்": "Thursday",
  "வெள்ளி": "Friday",
  "சனி": "Saturday",
  "இன்று": "Today",
  "இன்று முடிவடைந்தது": "Completed Today",
  "வருவாய் & நிதி தணிக்கை": "Revenue & Financial Audits",
  "நிதி தணிக்கை": "Financial Audits",
  "நேரலை நிதி விவரங்கள், தேதி வரம்பு வடிகட்டுதல், டிஜிட்டல் கட்டண பகுப்பாய்வு மற்றும் தணிக்கை பிடிஎஃப் ஏற்றுமதி.": "Real-time financial breakdown, custom date range filtering, digital fare analytics, and branded audit PDF export.",
  "நிகழ்த்திசை PDF ஏற்றுமதி செய்க": "Export Nigazhthisai PDF",
  "அனைத்து செயல்படும் மாவட்டங்கள்": "All Operating Districts",
  "அனைத்து செயல்படும்": "All Operating",
  "மொத்த நிகர வருவாய்": "Total Net Revenue",
  "மொத்த நிகர": "Total Net",
  "நிகர வருவாய்": "Net Revenue",
  "வழங்கப்பட்ட மொத்த டிக்கெட்டுகள்": "Total Tickets Issued",
  "வழங்கப்பட்ட டிக்கெட்டுகள்": "Tickets Issued",
  "வழங்கப்பட்டது": "ISSUED",
  "சராசரி டிக்கெட் கட்டணம்": "Average Ticket Fare",
  "சராசரி டிக்கெட்": "Average Ticket",
  "டிஜிட்டல் கட்டண பயன்பாடு": "Digital Fare Adoption",
  "டிஜிட்டல் கட்டணம்": "Digital Fare",
  "பயன்பாடு": "ADOPTION",
  "ஊடாடும் வருவாய் விநியோகம்": "Interactive Revenue Distribution",
  "ஊடாடும் வருவாய் விநியோகம் (நாள்)": "Interactive Revenue Distribution (DAY)",
  "ஊடாடும் வருவாய் விநியோகம் (பேருந்து)": "INTERACTIVE REVENUE DISTRIBUTION (BUS)",
  "ஊடாடும் வருவாய் விநியோகம் (வழித்தடம்)": "INTERACTIVE REVENUE DISTRIBUTION (ROUTE)",
  "ஊடாடும் வருவாய் விநியோகம் (சலுகை)": "INTERACTIVE REVENUE DISTRIBUTION (CONCESSION)",
  "ஊடாடும் வருவாய் விநியோகம் (பணம் செலுத்தும் முறை)": "INTERACTIVE REVENUE DISTRIBUTION (PAYMENT_METHOD)",
  "ஊடாடும்": "INTERACTIVE",
  "விநியோகம் (நாள்)": "Distribution (DAY)",
  "விநியோகம் (பேருந்து)": "DISTRIBUTION (BUS)",
  "விநியோகம் (வழித்தடம்)": "DISTRIBUTION (ROUTE)",
  "விநியோகம்": "Distribution",
  "பிரிவுகள் முழுவதும் ஒப்பீடுகள். துல்லியமான வசூலை அறிய பார்களின் மீது சுட்டியை வைக்கவும்.": "Visual comparisons across segments. Hover bars to inspect exact collections.",
  "மொத்த வருவாய்": "Total Revenue",
  "வரைபட பகுப்பாய்வு உருவாக்கப்படுகிறது…": "Generating visual analytics…",
  "தேர்ந்தெடுக்கப்பட்ட அளவுகளுக்கு வருவாய் தரவு எதுவும் இல்லை.": "No revenue data available for selected parameters.",
  "நாள் வாரியாக": "By Day",
  "பேருந்து வாரியாக": "By Bus",
  "வழித்தடம் வாரியாக": "By Route",
  "சலுகை வாரியாக": "By Concession",
  "பணம் செலுத்தும் முறை வாரியாக": "By Payment Method",
  "பகுப்பாய்வு வரிசைகள் ஏற்றப்படுகின்றன…": "Loading breakdown rows…",
  "பதிவுகள் எதுவும் காணப்படவில்லை.": "No records found.",
  "டிக்கெட்டுகள்": "tickets",
  "டிக்கெட்": "ticket",
  "ரொக்கம்": "Cash",
  "டிஜிட்டல்": "Digital",
  "யுபிஐ": "UPI",
  "ரொக்கக் கட்டணம்": "CASH FARE",
  "நிகழ்த்திசை போக்குவரத்து அமைப்பு": "NIGAZHTHISAI TRANSIT SYSTEMS",
  "போக்குவரத்து செயல்பாடுகள் & நிதி வருவாய் தணிக்கை அறிக்கை": "Transit Operations & Financial Revenue Audit Report",
  "நிர்வாக தணிக்கைச் சுருக்கம்": "EXECUTIVE AUDIT SUMMARY",
  "மாவட்ட வரம்பு": "District Scope",
  "வருவாய் அறிக்கைகள் & PDF": "Revenue Reports & PDF",
  "போக்குவரத்து நிறுத்தங்கள் & வரிசைமுறை:": "Transit Stops & Sequence:",
  "போக்குவரத்து நிறுத்தங்கள் & வரிசைமுறை": "Transit Stops & Sequence",
  "போக்குவரத்து நிறுத்தங்கள்": "Transit Stops",
  "போக்குவரத்து": "Transit",
  "போக்குவரத்து வழித்தடம்": "TRANSIT CORRIDOR",
  "வழித்தடத்தை உள்ளமைக்க": "Configure Corridor",
  "நிறுத்தங்கள் ஒதுக்கப்பட்டன": "STOPS ASSIGNED",
  "ஒதுக்கப்பட்டது": "Assigned",
  "ஒதுக்கப்பட்ட பேருந்து": "Assigned Bus",
  "ஒதுக்கப்பட்ட நடத்துனர்": "Assigned Conductor",
  "வழித்தடத்தில் நிறுத்தம் சேர்க்க:": "Add Stop to Corridor:",
  "வழித்தடத்தில் நிறுத்தம் சேர்க்க": "Add Stop to Corridor",
  "சேர்க்க வேண்டிய பேருந்து நிறுத்தத்தைத் தேர்வு செய்க…": "Select bus stop to insert…",
  "சேர்க்க வேண்டிய பேருந்து நிறுத்தத்தைத் தேர்வு செய்க...": "Select bus stop to insert...",
  "இந்த அட்டவணைக்கு நிறுத்தங்கள் அமைக்கப்படவில்லை. மேலே உள்ள தேர்வியைப் பயன்படுத்தி நிறுத்தங்களைச் சேர்க்கவும்.": "No stops configured for this schedule. Add stops using the selector above.",
  "நிறுத்த வரிசையைச் சேமி": "Save Stop Sequence",
  "நிறுத்த வரிசை": "STOP SEQUENCE",
  "வரிசை": "Sequence",
  "நிறுத்தங்கள் & வருகை நேரத்தை நிர்வகி": "Manage Stops & ETA",
  "நிர்வகி": "MANAGE",
  "வருகை நேரம் (ETA)": "ETA",
  "வருகை நேரம்:": "ETA:",
  "வழியாக": "via",
  "ரயில் நிலையம்": "Railway Station",
  "புதிய பேருந்து நிலையம்": "New Bus Stand",
  "பழைய பேருந்து நிலையம்": "Old Bus Stand",
  "பேருந்து நிலையம்": "Bus Stand",
  "பேருந்து நிறுத்தம்": "Bus Stop",
  "பேருந்து நிறுத்தங்கள்": "Bus Stops",
  "சந்திப்பு": "Junction",
  "சமிக்ஞை": "Signal",
  "சந்தை": "Market",
  "மருத்துவமனை": "Hospital",
  "கல்லூரி": "College",
  "வடக்கு": "North",
  "தெற்கு": "South",
  "கிழக்கு": "East",
  "மேற்கு": "West",
  "சாலை": "Road",
  "தெரு": "Street",
  "நகர்": "Nagar",
  "வழித்தட இணைப்பு": "Corridor",
  "வழித்தட இணைப்புகள்": "Corridors",
  "வழித்தடப் பாதைகள், நிறுத்த வரிசைகள் மற்றும் வழிப்புள்ளிகள்": "Route paths, stop sequences and waypoints",
  "வழித்தடத்தில் புறப்பாடு/சேருமிட இணைக்கான நிலையான கட்டணம்.": "Flat fare per origin/destination pair on a route.",
  "பேருந்துகள் செல்லும் வரிசையில் கீழே நிறுத்தங்களைச் சேர்க்கவும்.": "Add stops below in the order buses will visit them.",
  "இந்த நிறுத்தம் ஏற்கனவே இந்த வழித்தடத்தில் சேர்க்கப்பட்டுள்ளது.": "This stop is already added to this corridor.",
  "கட்டணக் கணக்கீடு மற்றும் பேருந்து வடிகட்டலுக்கு இந்த வரிசையே முதன்மையானது.": "Ordering here is authoritative for fare lookup and eligible-bus filtering.",
  "வழித்தடம் வெற்றிகரமாக உருவாக்கப்பட்டது": "Route Created Successfully",
  "வழித்தடம் வெற்றிகரமாகப் புதுப்பிக்கப்பட்டது": "Route Updated Successfully",
  "வழித்தடம் நீக்கப்பட்டது": "Route Deleted",
  "அவசர & SOS கட்டளை மையம்": "Emergency & SOS Command Desk",
  "கட்டளை மையம்": "Command Desk",
  "தொடர்ச்சியான நேரலை சம்பவ கண்காணிப்பு, 60 வினாடி தானியங்கி வாகன ஸ்கேனிங் மற்றும் நேரலை அவசர பதிலளிப்பாளர் அரட்டை.": "Continuous real-time incident telemetry, automated 60s idle fleet scanning, and live emergency responder chat.",
  "சைரன் இயக்கப்பட்டது (முடக்க கிளிக் செய்க)": "Siren Armed (Click to Mute)",
  "சைரன் முடக்கப்பட்டது (இயக்க கிளிக் செய்க)": "Siren Muted (Click to Arm)",
  "செயலில் உள்ள எச்சரிக்கைகள்": "Active Alerts",
  "வரலாறு & தணிக்கை": "History & Audit",
  "தணிக்கை பதிவு": "Audit Log",
  "தணிக்கை நிலை": "Audit Status",
  "மொத்த செயலில் உள்ள சம்பவங்கள்": "Total Active Incidents",
  "செயலில் உள்ள சம்பவங்கள்": "Active Incidents",
  "சம்பவங்கள்": "Incidents",
  "சம்பவம்": "Incident",
  "அவசர / SOS சமிக்ஞைகள்": "Critical / SOS Signals",
  "SOS சமிக்ஞைகள்": "SOS Signals",
  "சமிக்ஞைகள்": "Signals",
  "அவசர நடவடிக்கை தேவைப்படுகிறது": "Requires emergency response",
  "செயலற்ற / நகராத பேருந்துகள்": "Idle / Stationary Buses",
  "செயலற்ற / நகராத": "IDLE / STATIONARY",
  "செயலற்ற பேருந்துகள்": "Idle Buses",
  "நகராத": "Stationary",
  "செயலற்ற": "Idle",
  "தொடர்ச்சியான 60வி ஸ்கேன் செயலில் உள்ளது": "Continuous 60s scan active",
  "கணினி கண்காணிப்பு": "System Monitoring",
  "நேரலை தரவுத்தளம் ஒத்திசைக்கப்பட்டது": "Supabase Realtime synchronized",
  "நடத்துனரால் தூண்டப்பட்ட SOS": "SOS triggered by conductor",
  "பயணியால் தூண்டப்பட்ட SOS": "SOS triggered by passenger",
  "ஏற்றுக்கொள்": "Acknowledge",
  "தீர்த்துவை": "Resolve",
  "பதிலளிப்பாளர் அரட்டை": "Responder Chat",
  "அரட்டையை மறை": "Hide Chat",
  "அனைத்து மூலங்களும்": "All Sources",
  "பயணி SOS": "Passenger SOS",
  "நடத்துனர் SOS": "Conductor SOS",
  "வாகனத் தொலை அளவியல்": "Fleet Telemetry",
  "தொலை அளவியல்": "Telemetry",
  "செயலில் உள்ள எச்சரிக்கைகள் இல்லை": "No active alerts",
  "இந்த வடிப்பானுக்கான அனைத்து வாகன செயல்பாடுகளும் சீராக உள்ளன.": "All clear across fleet operations for this filter.",
  "செய்திகள் எதுவும் இல்லை. கீழே வழிமுறைகளை அனுப்பவும்.": "No messages yet. Send instructions below.",
  "பதில் வழிமுறைகளை உள்ளிடவும்…": "Type response instructions…",
  "அனுப்பு": "Send",
  "அறியப்படாத பேருந்து": "Unknown bus",
  "அறியப்படாத நடத்துனர்": "Unknown conductor",
  "பேருந்து பதிவு, பணிமனை நிலை மற்றும் பேருந்துகள்": "Fleet Registration, Depot Status and Buses",
  "பராமரிப்பு மேலாண்மை மையம்": "Fleet Maintenance Console",
  "ஒவ்வொரு பேருந்தும் விருப்பத்தேர்வாக வழித்தடத்திற்கும் மாவட்டத்திற்கும் ஒதுக்கப்படும்.": "Fleet vehicles, each optionally assigned to a route and operating district.",
  "சேவையில் உள்ள பேருந்துகள்": "Buses in Service",
  "இப்போது சேவையில் உள்ளது": "In-Service Now",
  "சேவையில் இல்லை": "Out of Service",
  "பழுதுபார்ப்பில் உள்ளது": "Under Repair",
  "பயன்பாட்டிலிருந்து நீக்கப்பட்டது": "Decommissioned",
  "செயல்பாட்டுக்குத் தயார்": "Operational / Ready",
  "செயல்பாட்டில் உள்ளது": "Operational",
  "மின்னேற்றும் பணிமனை": "Charging Depot",
  "மின்னேற்றப்படுகிறது": "CHARGING",
  "மின்கல அளவு %": "Battery Level %",
  "மின்கல %": "Battery %",
  "மின்கலன்": "Battery",
  "இடிஎம் இருப்பு, பராமரிப்பு மையம் மற்றும் பேருந்து க்யூஆர்": "ETM inventory, maintenance bay and bus QR",
  "இடிஎம் சாதனங்கள் & நேரலை இணைப்பு": "ETM Devices & Live Linking",
  "பயணத்தைத் தொடங்குவதற்கு முன் பேருந்தின் அடையாளத்தைச் சரிபார்க்க ஸ்கேன் செய்க": "Scan to verify bus identity before starting a trip",
  "பராமரிப்பு நிலையைப் பதிவு செய்க": "Log Maintenance Status",
  "பராமரிப்புக் குறிப்புகள் / மூலக் காரணம்": "Maintenance Notes / Root Cause",
  "பழுது / வன்பொருள் குறைபாடு": "Faulty / Hardware Defect",
  "பழுதடைந்தது": "FAULTY",
  "செயலற்ற பேருந்துகள் & பழுதான இடிஎம்கள்": "Inactive Buses & Faulty ETMs",
  "பேருந்துக்கு ஒதுக்கு": "Assign to Bus",
  "நடத்துனருக்கு ஒதுக்கு": "Assign to Conductor",
  "ஒதுக்கப்படவில்லை": "Unassigned",
  "இணைக்கப்பட்டது": "Linked",
  "இணைக்கப்படவில்லை": "Not linked",
  "எதுவுமில்லை / ஒதுக்கப்படவில்லை": "None / Unassigned",
  "சரிபார்ப்பு டோக்கன் / பேருந்து எண்ணை நகலெடு": "Copy Verification Token / Bus Number",
  "தினசரி அனுப்புதல்கள், பயண ஒதுக்கீடு மற்றும் கால அட்டவணை": "Daily dispatches, trip assigner and timetable",
  "பயணங்கள் & நேரலை அனுப்புதல்": "Trips & Live Dispatch",
  "அட்டவணைகள் & கால அட்டவணைகள்": "Schedules & Timetables",
  "புதிய பேருந்துப் பயணத்தைத் திட்டமிடுக": "Schedule New Bus Trip",
  "கால அட்டவணை புறப்பாடுகள்": "Timetable Departures",
  "வாரநாள் புறப்பாடு மாதிரிகள்": "Weekday Departure Templates",
  "வாரநாள் புறப்பாடு மாதிரியைச் சேர்க்க": "Add Weekday Departure Template",
  "அட்டவணையை உறுதிசெய்து நடத்துனரை ஒதுக்குக": "Confirm schedule & assign conductor",
  "நடத்துனர் இந்த பயணத்தை தங்கள் கட்டுப்பாட்டகத்தில் காண்பார்.": "The conductor will see this trip on their dashboard.",
  "பயணம் வெற்றிகரமாகத் திட்டமிடப்பட்டது": "Trip scheduled successfully",
  "பயணம் வெற்றிகரமாகப் புதுப்பிக்கப்பட்டது": "Trip updated successfully",
  "பயண கால அளவு (மணிநேரம்)": "Trip Duration (Hours)",
  "மதிப்பிடப்பட்ட கால அளவு (மணிநேரம்)": "Estimated Duration (Hours)",
  "கால அளவு (மணிநேரம்)": "Duration (hours)",
  "நடத்துனர் திட்டமிட்ட பயணத்தைத் தொடங்கியவுடன் நேரலை கண்காணிப்பு தானாகவே செயல்படும்.": "Live pipeline tracking activates automatically once a conductor starts a scheduled trip.",
  "நேரலை ரேடார் ஜிபிஎஸ் வரைபடம் மற்றும் வாகனக் கண்காணிப்பாளர்கள்": "Live radar GPS map and active fleet trackers",
  "அதிக பயணிகள் ஏறும் நிறுத்தம்:": "Busiest Boarding:",
  "அதிக பயணிகள் இறங்கும் நிறுத்தம்:": "Busiest Alighting:",
  "மொத்த முன்பதிவு செய்த பயணிகள்:": "Total Booked Pax:",
  "சரியான நேரத்தில்": "On-Time",
  "தாமதமானது": "Delayed",
  "ரத்து செய்யப்பட்டது": "Cancelled",
  "பயணிகள் குறைதீர்ப்பு மையம் மற்றும் உதவி வினவல்கள்": "Passenger grievance desk and help queries",
  "குறைகளை ஆய்வு செய்க": "Investigate Grievances",
  "மொத்த புகார்கள்": "Total Grievances",
  "தீர்க்கப்பட்ட புகார்கள்": "Resolved Grievances",
  "நிலுவையில் உள்ளவை": "Open & Unresolved",
  "மதிப்பாய்வில் உள்ளவை": "Pending Review",
  "தூய்மை & சுகாதாரம்": "Cleanliness & Hygiene",
  "ஓட்டுநர் / பணியாளர் நடத்தை": "Driver / Crew Conduct",
  "கூடுதல் கட்டணம் வசூலித்தல்": "Fare Overcharging",
  "அதிக கூட்டம்": "Overcrowding",
  "பாதுகாப்பு & உறுதிப்பாடு": "Safety & Security",
  "பொதுவான குறைபாடு": "General Grievance",
  "தீர்க்கப்பட்டதாகக் குறிக்க": "Mark Resolved",
  "சம்பவ விவரங்கள்": "Incident Details",
  "கண்ணோட்டம் மற்றும் முக்கிய செயல்பாட்டு அளவீடுகள்": "Overview and core operational telemetry",
  "அமைப்பு கட்டளை — அனைத்து செயல்படும் மாவட்டங்கள்": "System Command — All Operating Districts",
  "முதன்மை கட்டளை அதிகாரம்": "Master Command Authority",
  "ஆன்லைன் டிக்கெட் கட்டணம்": "Online Ticket Payments",
  "பயணிகள் யுபிஐ மூலம் டிஜிட்டல் டிக்கெட்டுகளை வாங்கலாம்.": "Passengers can buy digital tickets via UPI.",
  "கட்டணங்கள் முடக்கப்பட்டுள்ளன — நடத்துனர்கள் ரொக்க டிக்கெட்டுகளை மட்டுமே வழங்குவர்.": "Payments are disabled — conductors issue cash tickets only.",
  "நிறுத்தங்கள், வழித்தடங்கள் அல்லது கட்டணங்களை மொத்தமாகப் பதிவேற்றவும்.": "Bulk-load stops, routes, or fares.",
  "CSV கோப்பை இழுத்துப் போடவும், அல்லது உலாவ கிளிக் செய்யவும்": "Drag & drop a CSV, or click to browse",
  "அனைத்து போக்குவரத்து மாவட்டங்களிலும்": "Across all transit districts",
  "மாவட்டங்கள் மேலாண்மை": "Districts Management",
  "மாவட்ட எல்லை": "District Jurisdiction",
  "மாவட்ட செயல்பாடுகள்": "District Operations",
  "மாவட்ட வாகன செயல்பாடுகள்": "District Fleet Operations",
  "புதிய போக்குவரத்து மாவட்டத்தைச் சேர்க்க": "Add New Transit District",
  "போக்குவரத்து மாவட்டத்தை நீக்கு": "Delete Transit District",
  "நடத்துனர்கள் மேலாண்மை": "Conductors Management",
  "நடத்துனர் கணக்கு உருவாக்கப்பட்டது": "Conductor account created",
  "நடத்துனர் சுயவிவரம் புதுப்பிக்கப்பட்டது": "Conductor profile updated",
  "நிர்வாகியை நீக்கு": "Delete Administrator",
  "அனுமதியை ரத்து செய்": "Revoke Role",
  "அனுமதி வழங்கப்பட்டது": "ACCESS GRANTED",
  "அனுமதி ரத்து செய்யப்பட்டது": "ACCESS REVOKED",
  "அனுமதி ரத்து அறிவிப்பு": "Access Revocation Notice",
  "வழித்தடத்தைத் தேர்வு செய்க": "Select a route",
  "பேருந்தைத் தேர்வு செய்க": "Select a bus",
  "நடத்துனரைத் தேர்வு செய்க": "Select a conductor",
  "நிறுத்தத்தைத் தேர்வு செய்க": "Select a stop",
  "மாவட்டத்தைத் தேர்வு செய்க": "Select district",
  "மாவட்டத்தைத் தேர்வு செய்க (விருப்பத்தேர்வு)…": "Select district (optional)…",
  "இடிஎம் சாதனத்தைத் தேர்வு செய்க": "Select ETM Device",
  "பேருந்தைத் தேர்வு செய்க:": "Select Bus:",
  "அனைத்து வகைகள்": "All Categories",
  "அனைத்து தீவிர நிலைகளும்": "All Severities",
  "அனைத்து நிலைகளும்": "All Statuses",
  "அனைத்தும் சீராக உள்ளது": "All Clear",
  "தேதி & நேரத்தைத் தேர்வு செய்க": "Choose date & time",
  "பேருந்து எண் / பதிவை தேடுக…": "Search bus number / reg…",
  "பேருந்து, தலைப்பு, செய்தியை தேடுக…": "Search bus, title, message…",
  "10-இலக்க மொபைல் எண்": "10-digit mobile number",
  "முழு பெயர்": "Full display name",
  "காட்சிப் பெயர்": "Display Name",
  "தொலைபேசி எண் *": "Phone Number *",
  "அரசு அடையாள எண்": "Government ID",
  "வரிசை எண் *": "Serial Number *",
  "ஒதுக்கீட்டுக் குறிப்புகள் (விருப்பத்தேர்வு)": "Assignment Notes (Optional)",
  "மாற்றத்திற்கான காரணம்": "Reason for Modification",
  "குறிப்புகள்": "Notes",
  "புவியியல் ஆயங்கள்": "Coordinates",
  "அட்சரேகை (Latitude)": "Latitude",
  "தீர்க்கரேகை (Longitude)": "Longitude",
  "புறப்படும் இடம்": "Origin",
  "சேருமிடம்": "Destination",
  "புறப்படும் நிறுத்தம்": "Origin stop",
  "சேரும் நிறுத்தம்": "Destination stop",
  "நிறுத்தக் குறியீடு": "Stop code",
  "பேருந்து எண்": "Bus number",
  "பேருந்து வாகனம்": "Bus Vehicle",
  "மொத்த பேருந்துக் குழு": "Total Fleet",
  "மொத்தப் பட்டியல்": "Total Roster",
  "மொத்தம் பதிவானவை": "Total Logged",
  "தீவிரம்": "Severity",
  "மூலம்": "Source",
  "எச்சரிக்கை": "Warning",
  "தகவல்": "Info",
  "இணைப்பற்றது": "Offline",
  "இணைப்பற்ற சேமிப்பு": "Offline Storage",
  "ஒத்திசைக்கப்பட்டது": "Synced",
  "செல்லுபடியாகும்": "Valid",
  "தமிழ்நாடு": "Tamil Nadu",
  "மொத்த": "TOTAL",
  "நிகர": "NET",
  "சராசரி": "AVERAGE",
  "நிறுத்தம்": "STOP",
  "சுழற்சி": "CADENCE",
  "வரிசைமுறை": "SEQUENCE",
  "கட்டளை": "COMMAND",
  "மையம்": "DESK",
  "பேருந்து": "BUS",
  "வழித்தடம்": "ROUTE",
  "பயணம்": "TRIP",
  "செயல்படும்": "OPERATING",
  "எச்சரிக்கைகள்": "ALERTS",
  "வரலாறு": "HISTORY",
  "தணிக்கை": "AUDIT",
  "சைரன்": "SIREN",
  "முடக்கப்பட்டது": "MUTED",
  "இயக்கப்பட்டது": "ARMED",
  "கிளிக் செய்க": "CLICK",
  "பதிலளிப்பாளர்": "RESPONDER",
  "அரட்டை": "CHAT",
  "தேர்வு செய்க": "SELECT",
  "நிலையான": "STANDARD",
  "நிலையம்": "STATION",
  "கரந்தை": "Karanthai",
  "வல்லம்": "Vallam",
  "தஞ்சை": "Thanjai",
  "மருத்துவக் கல்லூரி": "Medical College",
  "மருத்துவக் கல்லூரி சந்திப்பு": "Medical College Junction",
  "ரயில் நிலையம் வடக்கு": "Railway Station North",
  "வல்லம் சாலை சந்தை": "Vallam Road Market",
  "கரந்தை சிக்னல்": "Karanthai Signal",
  "தஞ்சாவூர் புதிய பேருந்து நிலையம் முதல் தஞ்சாவூர் பழைய பேருந்து நிலையம் வரை": "Thanjavur New Bus Stand to Thanjavur Old Bus Stand",
  "தஞ்சாவூர் புதிய பேருந்து நிலையம்": "Thanjavur New Bus Stand",
  "தஞ்சாவூர் பழைய பேருந்து நிலையம்": "Thanjavur Old Bus Stand",
  "இயக்க கிளிக் செய்க": "Click to Arm",
  "முடக்க கிளிக் செய்க": "Click to Mute",
  "ஒதுக்கப்பட்ட நிறுத்தங்கள்": "STOPS ASSIGNED"
};

// Dynamic regex patterns for composite and parameterized strings (English -> Tamil)
const dynamicPatterns: Array<{ regex: RegExp; replace: (match: RegExpMatchArray) => string }> = [
  {
    regex: /^(\d+)\s+tickets?$/i,
    replace: (m) => `${m[1]} டிக்கெட்டுகள்`,
  },
  {
    regex: /^(\d+)\s+STOPS?\s+ASSIGNED$/i,
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

// Pre-sort dictionary keys by length descending
const sortedEntries = Object.entries(dictionary).sort(
  (a, b) => b[0].length - a[0].length
);

const sortedReverseEntries = Object.entries(reverseDictionary).sort(
  (a, b) => b[0].length - a[0].length
);

function escapeRegex(str: string) {
  return str.replace(/[.*+?^\$\{\}()|[\]\\]/g, "\\$&");
}

// Phonetic Transliteration Engine for new user/stop/route names not in dictionary
const baseConsonantMap: Record<string, string> = {
  k: "க", g: "க", kh: "க", gh: "க", ng: "ங",
  ch: "ச", c: "ச", s: "ஸ", sh: "ஷ", j: "ஜ", z: "ஸ",
  th: "த", dh: "த", d: "ட", t: "ட",
  n: "ன", nn: "ண",
  p: "ப", b: "ப", f: "ப", m: "ம",
  y: "ய", r: "ர", l: "ல", ll: "ள",
  v: "வ", w: "வ", zh: "ழ", h: "ஹ"
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
  // Don't transliterate numbers, plates, or codes (e.g. TN-38, ETM-01)
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

  return result;
}

// Translate English to Tamil
export function translateText(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return rawText;

  // 1. Direct dictionary match
  if (dictionary[trimmed]) {
    return rawText.replace(trimmed, dictionary[trimmed]!);
  }

  // 2. Trailing punctuation handling (e.g. "From:", "To:", "Cadence:")
  if (trimmed.endsWith(":")) {
    const withoutColon = trimmed.slice(0, -1).trim();
    if (dictionary[withoutColon]) {
      return rawText.replace(trimmed, dictionary[withoutColon] + ":");
    }
  }

  // 3. Dynamic patterns match
  for (const p of dynamicPatterns) {
    const match = trimmed.match(p.regex);
    if (match) {
      return rawText.replace(trimmed, p.replace(match));
    }
  }

  // 4. Sub-phrase replacement with safe word-boundary matching for alphanumeric phrases
  let result = rawText;
  let changed = false;
  for (const [key, val] of sortedEntries) {
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

  // 5. If words remain untranslated and contain standard alphabetic letters, apply auto phonetic transliteration
  if (!changed && /^[A-Za-z\s]+$/.test(trimmed) && trimmed.length > 2) {
    const transliterated = trimmed.split(/\s+/).map(transliterateWord).join(" ");
    if (transliterated !== trimmed) {
      return rawText.replace(trimmed, transliterated);
    }
  }

  return changed ? result : rawText;
}

// Revert Tamil back to English cleanly
export function revertToEnglish(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return rawText;
  if (!/[\u0B80-\u0BFF]/.test(trimmed)) return rawText; // Already English

  // 1. Exact reverse dictionary match
  if (reverseDictionary[trimmed]) {
    return rawText.replace(trimmed, reverseDictionary[trimmed]!);
  }

  // 2. Dynamic reverse patterns
  for (const p of reversePatterns) {
    const match = trimmed.match(p.regex);
    if (match) {
      return rawText.replace(trimmed, p.replace(match));
    }
  }

  // 3. Sub-phrase reverse replacement
  let result = rawText;
  for (const [ta, en] of sortedReverseEntries) {
    if (ta.length >= 2 && result.includes(ta)) {
      result = result.split(ta).join(en);
    }
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

    const handleNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        if (lang === "ta") {
          if (!(node as any).__origEn) {
            (node as any).__origEn = node.nodeValue;
          }
          const original = (node as any).__origEn || node.nodeValue;
          const translated = translateText(original);
          if (translated !== node.nodeValue) {
            node.nodeValue = translated;
          }
        } else {
          // Revert cleanly to English
          if ((node as any).__origEn) {
            node.nodeValue = (node as any).__origEn;
          } else if (/[\u0B80-\u0BFF]/.test(node.nodeValue)) {
            node.nodeValue = revertToEnglish(node.nodeValue);
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
              if (!(el as any).__origPlaceholder) {
                (el as any).__origPlaceholder = el.placeholder;
              }
              const orig = (el as any).__origPlaceholder || el.placeholder;
              const translated = translateText(orig);
              if (translated !== el.placeholder) {
                el.placeholder = translated;
              }
            }
          } else {
            if ((el as any).__origPlaceholder) {
              el.placeholder = (el as any).__origPlaceholder;
            } else if (/[\u0B80-\u0BFF]/.test(el.placeholder)) {
              el.placeholder = revertToEnglish(el.placeholder);
            }
          }
        }

        // Translate / Revert element titles (buttons, icons, tooltips)
        if (el.title) {
          if (lang === "ta") {
            if (!(el as any).__origTitle) {
              (el as any).__origTitle = el.title;
            }
            const orig = (el as any).__origTitle || el.title;
            const translated = translateText(orig);
            if (translated !== el.title) {
              el.title = translated;
            }
          } else {
            if ((el as any).__origTitle) {
              el.title = (el as any).__origTitle;
            } else if (/[\u0B80-\u0BFF]/.test(el.title)) {
              el.title = revertToEnglish(el.title);
            }
          }
        }

        node.childNodes.forEach(handleNode);
      }
    };

    // Apply to current DOM tree
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
