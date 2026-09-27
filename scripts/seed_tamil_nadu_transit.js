const fs = require('fs');
const path = require('path');
const { createClient } = require('../node_modules/@supabase/supabase-js');

const envPath = path.resolve(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=([^\r\n]+)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=([^\r\n]+)/);

if (!urlMatch || !keyMatch) {
  console.error('Supabase credentials not found in .env');
  process.exit(1);
}

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  console.log('Authenticating as master admin...');
  const { error: loginErr } = await supabase.auth.signInWithPassword({
    email: 'admin@nigazhthisai.com',
    password: 'admin123',
  });
  if (loginErr) {
    console.error('Login error:', loginErr);
    process.exit(1);
  }
  console.log('Admin authenticated successfully.');

  // 1. Ensure districts exist
  const requiredDistricts = [
    { name: 'Chennai', code: 'CHE', state: 'Tamil Nadu' },
    { name: 'Coimbatore', code: 'CBE', state: 'Tamil Nadu' },
    { name: 'Krishnagiri', code: 'KRI', state: 'Tamil Nadu' },
    { name: 'Thanjavur', code: 'TNJ', state: 'Tamil Nadu' },
    { name: 'Madurai', code: 'MDU', state: 'Tamil Nadu' },
    { name: 'Salem', code: 'SLM', state: 'Tamil Nadu' },
    { name: 'Tiruppur', code: 'TUP', state: 'Tamil Nadu' },
    { name: 'Trichy', code: 'TRY', state: 'Tamil Nadu' },
    { name: 'Erode', code: 'ERD', state: 'Tamil Nadu' },
  ];

  for (const dist of requiredDistricts) {
    const { data: existing } = await supabase.from('districts').select('id').eq('code', dist.code).maybeSingle();
    if (!existing) {
      const { data, error } = await supabase.from('districts').insert(dist).select();
      if (error) console.error('Error creating district:', dist.name, error);
      else console.log('Created district:', dist.name, data[0]?.id);
    }
  }

  // Fetch updated districts
  const { data: allDistricts } = await supabase.from('districts').select('id, name, code');
  const distMap = {};
  allDistricts.forEach((d) => {
    distMap[d.name.toLowerCase()] = d.id;
  });

  // Standardize existing Thanjai stops
  const thanjavurId = distMap['thanjavur'];
  if (thanjavurId) {
    await supabase
      .from('stops')
      .update({ district: 'Thanjavur', district_id: thanjavurId })
      .ilike('district', '%thanj%');
  }

  // 2. Curated Stops Catalog for All Major Districts
  const stopsToSeed = [
    // Chennai
    { name: 'Puratchi Thalaivar Dr. M.G.R. Central', code: 'MAS', district: 'Chennai', lng: 80.2757, lat: 13.0827 },
    { name: 'Koyambedu (CMBT)', code: 'CMBT', district: 'Chennai', lng: 80.2056, lat: 13.0694 },
    { name: 'T. Nagar Bus Terminus', code: 'TNG', district: 'Chennai', lng: 80.2341, lat: 13.0418 },
    { name: 'Tambaram Sanatorium', code: 'TBM', district: 'Chennai', lng: 80.1265, lat: 12.9255 },
    { name: 'Guindy Industrial Estate', code: 'GDY', district: 'Chennai', lng: 80.2025, lat: 13.0067 },
    { name: 'Broadway Terminus', code: 'BWY', district: 'Chennai', lng: 80.2872, lat: 13.0878 },
    { name: 'Adyar Old Depot', code: 'ADY', district: 'Chennai', lng: 80.2565, lat: 13.0012 },

    // Coimbatore
    { name: 'Gandhipuram Central Bus Stand', code: 'GDP', district: 'Coimbatore', lng: 76.9673, lat: 11.0168 },
    { name: 'Ukkadam Bus Terminus', code: 'UKD', district: 'Coimbatore', lng: 76.9602, lat: 10.9897 },
    { name: 'Singanallur Bus Stand', code: 'SGL', district: 'Coimbatore', lng: 77.0264, lat: 10.9984 },
    { name: 'Coimbatore Railway Junction', code: 'CBE-JN', district: 'Coimbatore', lng: 76.9649, lat: 10.9979 },
    { name: 'RS Puram Head Post Office', code: 'RSP', district: 'Coimbatore', lng: 76.9482, lat: 11.0089 },
    { name: 'Coimbatore International Airport', code: 'CJB', district: 'Coimbatore', lng: 77.0434, lat: 11.0300 },
    { name: 'Saravanampatti IT Corridor', code: 'SVP', district: 'Coimbatore', lng: 76.9959, lat: 11.0824 },

    // Krishnagiri
    { name: 'Hosur Bus Terminus', code: 'HSR-01', district: 'Krishnagiri', lng: 77.8253, lat: 12.7409 },

    // Madurai
    { name: 'Mattuthavani Integrated Bus Terminus', code: 'MDU-MIBT', district: 'Madurai', lng: 78.1528, lat: 9.9329 },
    { name: 'Arapalayam Bus Stand', code: 'MDU-ARP', district: 'Madurai', lng: 78.1065, lat: 9.9348 },
    { name: 'Periyar Bus Stand', code: 'MDU-PER', district: 'Madurai', lng: 78.1154, lat: 9.9171 },
    { name: 'Madurai Junction Railway Station', code: 'MDU-JN', district: 'Madurai', lng: 78.1102, lat: 9.9185 },
    { name: 'Thiruparankundram Temple Stop', code: 'MDU-TPK', district: 'Madurai', lng: 78.0705, lat: 9.8804 },

    // Salem
    { name: 'Salem New Bus Stand', code: 'SLM-NBS', district: 'Salem', lng: 78.1408, lat: 11.6667 },
    { name: 'Salem Old Bus Stand', code: 'SLM-OBS', district: 'Salem', lng: 78.1578, lat: 11.6582 },
    { name: 'Salem Junction Railway Station', code: 'SLM-JN', district: 'Salem', lng: 78.1165, lat: 11.6698 },
    { name: 'Shevapet Commercial Centre', code: 'SLM-SHV', district: 'Salem', lng: 78.1442, lat: 11.6508 },

    // Tiruppur
    { name: 'Tiruppur Old Bus Stand', code: 'TUP-OBS', district: 'Tiruppur', lng: 77.3411, lat: 11.1085 },
    { name: 'Tiruppur New Bus Stand', code: 'TUP-NBS', district: 'Tiruppur', lng: 77.3482, lat: 11.1278 },
    { name: 'Tiruppur Railway Station', code: 'TUP-JN', district: 'Tiruppur', lng: 77.3458, lat: 11.1118 },

    // Trichy
    { name: 'Central Bus Stand Trichy', code: 'TRY-CBS', district: 'Trichy', lng: 78.6872, lat: 10.7955 },
    { name: 'Chatram Bus Stand', code: 'TRY-CHB', district: 'Trichy', lng: 78.6946, lat: 10.8324 },
    { name: 'Tiruchirappalli Junction', code: 'TRY-JN', district: 'Trichy', lng: 78.6865, lat: 10.7936 },

    // Erode
    { name: 'Erode Central Bus Terminus', code: 'ERD-CBT', district: 'Erode', lng: 77.7172, lat: 11.3410 },
    { name: 'Erode Junction Railway Station', code: 'ERD-JN', district: 'Erode', lng: 77.7275, lat: 11.3342 },
    { name: 'Brough Road Commercial Market', code: 'ERD-BRM', district: 'Erode', lng: 77.7240, lat: 11.3465 },
  ];

  let insertedStops = 0;
  for (const s of stopsToSeed) {
    const { data: existing } = await supabase.from('stops').select('id').eq('code', s.code).maybeSingle();
    const dId = distMap[s.district.toLowerCase()] || null;
    if (!existing) {
      const payload = {
        name: s.name,
        code: s.code,
        district: s.district,
        district_id: dId,
        location: `POINT(${s.lng} ${s.lat})`,
        is_active: true,
      };
      const { error } = await supabase.from('stops').insert(payload);
      if (error) {
        console.error('Error inserting stop', s.code, error);
      } else {
        insertedStops++;
      }
    } else {
      // Ensure district_id and district are set correctly
      await supabase.from('stops').update({ district: s.district, district_id: dId }).eq('id', existing.id);
    }
  }
  console.log(`Successfully seeded/updated ${insertedStops} stops in Supabase database.`);

  // 3. Connect Stops into Routes for Top Corridors (if not already existing)
  const routesToSeed = [
    {
      route_number: '102',
      name: 'Broadway – Tambaram Sanatorium via Central & Guindy',
      code: '102',
      district: 'Chennai',
      stops: ['BWY', 'MAS', 'GDY', 'TBM'],
    },
    {
      route_number: '570',
      name: 'CMBT Koyambedu – Adyar Old Depot via Guindy',
      code: '570',
      district: 'Chennai',
      stops: ['CMBT', 'GDY', 'ADY'],
    },
    {
      route_number: '1C',
      name: 'Gandhipuram – Ukkadam via Railway Junction',
      code: '1C',
      district: 'Coimbatore',
      stops: ['GDP', 'CBE-JN', 'UKD'],
    },
    {
      route_number: '11',
      name: 'Gandhipuram – Coimbatore Airport via Singanallur',
      code: '11',
      district: 'Coimbatore',
      stops: ['GDP', 'SGL', 'CJB'],
    },
    {
      route_number: '70',
      name: 'Mattuthavani – Periyar Terminus via Arapalayam',
      code: '70',
      district: 'Madurai',
      stops: ['MDU-MIBT', 'MDU-ARP', 'MDU-PER'],
    },
    {
      route_number: '14',
      name: 'Salem New Bus Stand – Salem Junction via Old Bus Stand',
      code: '14',
      district: 'Salem',
      stops: ['SLM-NBS', 'SLM-OBS', 'SLM-JN'],
    },
    {
      route_number: '3',
      name: 'Tiruppur Old Bus Stand – Tiruppur New Bus Stand via Railway Station',
      code: '3',
      district: 'Tiruppur',
      stops: ['TUP-OBS', 'TUP-JN', 'TUP-NBS'],
    },
    {
      route_number: '1',
      name: 'Trichy Central Bus Stand – Chatram Bus Stand via Junction',
      code: '1',
      district: 'Trichy',
      stops: ['TRY-CBS', 'TRY-JN', 'TRY-CHB'],
    },
    {
      route_number: '5',
      name: 'Erode Central Bus Terminus – Erode Junction via Brough Road',
      code: '5',
      district: 'Erode',
      stops: ['ERD-CBT', 'ERD-BRM', 'ERD-JN'],
    },
  ];

  // Fetch all stops into map
  const { data: allStopsData } = await supabase.from('stops').select('id, code');
  const stopCodeMap = {};
  allStopsData.forEach((s) => {
    stopCodeMap[s.code] = s.id;
  });

  for (const r of routesToSeed) {
    const { data: existingRoute } = await supabase.from('routes').select('id').eq('code', r.code).maybeSingle();
    let routeId = existingRoute?.id;
    if (!routeId) {
      const dId = distMap[r.district.toLowerCase()] || null;
      const { data: newRoute, error: rErr } = await supabase
        .from('routes')
        .insert({
          route_number: r.route_number,
          name: r.name,
          code: r.code,
          district_id: dId,
          is_active: true,
        })
        .select()
        .single();
      if (rErr) {
        console.error('Error inserting route', r.code, rErr);
        continue;
      }
      routeId = newRoute.id;
      console.log('Created route:', r.route_number, routeId);
    }

    // Attach route stops
    for (let i = 0; i < r.stops.length; i++) {
      const sCode = r.stops[i];
      const stopId = stopCodeMap[sCode];
      if (stopId && routeId) {
        const { data: existingRS } = await supabase
          .from('route_stops')
          .select('id')
          .eq('route_id', routeId)
          .eq('stop_id', stopId)
          .maybeSingle();
        if (!existingRS) {
          await supabase.from('route_stops').insert({
            route_id: routeId,
            stop_id: stopId,
            sequence_order: i + 1,
            eta_offset_minutes: i * 8,
          });
        }
      }
    }
  }

  console.log('Route stops linking complete.');
  console.log('Seeding finished successfully!');
}

run().catch(console.error);
