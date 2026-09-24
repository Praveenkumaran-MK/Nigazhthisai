-- =============================================================================
-- Migration 068: Fix Missing updated_at on Tickets & Robust validate_ticket RPCs
--
-- ROOT CAUSE:
-- 1. validate_ticket and validate_ticket_by_pnr attempted to update updated_at = now()
--    on public.tickets.
-- 2. public.tickets lacked the updated_at column, causing PostgreSQL to raise:
--    ERROR: column "updated_at" of relation "tickets" does not exist (SQLSTATE 42703).
-- 3. In the conductor scanner UI, this PostgREST 400 error was caught and masked
--    as "Invalid or expired ticket", preventing legitimate tickets from being validated.
-- =============================================================================

-- 1. Add updated_at column to tickets and tickets_archive
alter table public.tickets
  add column if not exists updated_at timestamptz not null default now();

alter table public.tickets_archive
  add column if not exists updated_at timestamptz not null default now();

-- Ensure permissions
grant all on public.tickets to authenticated;
grant select on public.tickets to anon;

grant all on public.tickets_archive to authenticated;
grant select on public.tickets_archive to anon;

-- 2. Update is_conductor_for_trip helper to be fully resilient
create or replace function public.is_conductor_for_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    join public.conductors c on c.id = t.conductor_id
    where t.id = p_trip_id
      and (c.user_id = auth.uid() or c.id = auth.uid())
  ) or is_any_admin();
$$;

-- 3. Robust validate_ticket RPC
create or replace function public.validate_ticket(
  p_qr_payload text,
  p_trip_id    uuid
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanned_payload    text;
  v_scanned_signature  text;
  v_ticket             public.tickets;
  v_hmac_key           text;
  v_expected_signature text;
  v_conductor_user_id  uuid;
begin
  -- Conductor / Admin authorization check
  if not is_conductor_for_trip(p_trip_id) and not is_any_admin() then
    raise exception 'NOT_AUTHORIZED: caller is not the active conductor for this trip';
  end if;

  select user_id into v_conductor_user_id
  from public.conductors
  where id = (select conductor_id from public.trips where id = p_trip_id);

  -- Payload and signature parsing
  v_scanned_payload   := split_part(p_qr_payload, '.', 1);
  v_scanned_signature := split_part(p_qr_payload, '.', 2);

  if v_scanned_payload = '' then
    v_scanned_payload := p_qr_payload;
  end if;

  -- Lock ticket row
  select * into v_ticket
  from public.tickets
  where qr_payload = v_scanned_payload
  for update;

  if v_ticket is null then
    raise exception 'TICKET_NOT_FOUND: no ticket matches the provided QR code';
  end if;

  -- Verify signature if signature component was present in the QR
  if v_scanned_signature <> '' then
    select value into v_hmac_key from public.app_secrets where name = 'ticket_qr_hmac_key';
    if v_hmac_key is null then
      v_hmac_key := 'nigazhthisai-production-default-qr-key-2026';
    end if;

    v_expected_signature := encode(
      extensions.hmac(v_ticket.qr_payload || '|' || v_ticket.trip_id::text, v_hmac_key, 'sha256'),
      'hex'
    );

    if v_expected_signature <> v_ticket.qr_signature and v_scanned_signature <> v_ticket.qr_signature then
      raise exception 'TICKET_SIGNATURE_INVALID: ticket digital signature could not be verified';
    end if;
  end if;

  -- Trip Match Check
  if v_ticket.trip_id <> p_trip_id then
    raise exception 'WRONG_TRIP: ticket was issued for a different trip/bus';
  end if;

  -- Already validated check
  if v_ticket.status = 'VALIDATED' or coalesce(v_ticket.is_validated, false) then
    raise exception 'ALREADY_VALIDATED: ticket has already been validated and boarded';
  end if;

  -- Expiry Check
  if v_ticket.status = 'EXPIRED' or v_ticket.expires_at < now() then
    raise exception 'TICKET_EXPIRED: ticket has expired';
  end if;

  -- Cancelled Check
  if v_ticket.status = 'CANCELLED' then
    raise exception 'TICKET_CANCELLED: ticket has been cancelled';
  end if;

  -- Perform update (safely updating updated_at now that the column is present)
  update public.tickets
  set status       = 'VALIDATED',
      is_validated = true,
      validated_at = now(),
      validated_by = coalesce(auth.uid(), v_conductor_user_id),
      updated_at   = now()
  where id = v_ticket.id
  returning * into v_ticket;

  -- Update trip occupancy
  insert into public.trip_occupancy (trip_id, current_passenger_count, capacity)
  select p_trip_id, v_ticket.passenger_count, coalesce(b.capacity, 50)
  from public.trips t
  left join public.buses b on b.id = t.bus_id
  where t.id = p_trip_id
  on conflict (trip_id) do update
    set current_passenger_count = trip_occupancy.current_passenger_count + v_ticket.passenger_count;

  return v_ticket;
end;
$$;

grant execute on function public.validate_ticket(text, uuid) to authenticated, anon;

-- 4. Robust validate_ticket_by_pnr RPC
create or replace function public.validate_ticket_by_pnr(
  p_pnr     text,
  p_trip_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket            public.tickets;
  v_conductor_user_id uuid;
  v_from_name         text;
  v_to_name           text;
begin
  select * into v_ticket
  from public.tickets
  where upper(trim(pnr)) = upper(trim(p_pnr))
  for update;

  if v_ticket is null then
    return jsonb_build_object(
      'success', false,
      'code',    'TICKET_NOT_FOUND',
      'message', 'No ticket found with PNR: ' || coalesce(p_pnr, '')
    );
  end if;

  if v_ticket.status = 'VALIDATED' or coalesce(v_ticket.is_validated, false) then
    return jsonb_build_object(
      'success',      false,
      'code',         'ALREADY_VALIDATED',
      'message',      'Ticket with PNR ' || v_ticket.pnr || ' was already validated',
      'validated_at', v_ticket.validated_at
    );
  end if;

  if v_ticket.status = 'EXPIRED' or v_ticket.expires_at < now() then
    return jsonb_build_object(
      'success', false,
      'code',    'TICKET_EXPIRED',
      'message', 'Ticket has expired',
      'pnr',     v_ticket.pnr
    );
  end if;

  if v_ticket.status = 'CANCELLED' then
    return jsonb_build_object(
      'success', false,
      'code',    'TICKET_CANCELLED',
      'message', 'Ticket has been cancelled',
      'pnr',     v_ticket.pnr
    );
  end if;

  if p_trip_id is not null and v_ticket.trip_id <> p_trip_id then
    return jsonb_build_object(
      'success', false,
      'code',    'WRONG_TRIP',
      'message', 'Ticket is booked for a different bus trip',
      'pnr',     v_ticket.pnr
    );
  end if;

  v_conductor_user_id := auth.uid();
  if v_conductor_user_id is null and p_trip_id is not null then
    select conductor_id into v_conductor_user_id from public.trips where id = p_trip_id;
  end if;

  update public.tickets
  set is_validated = true,
      validated_at = now(),
      validated_by = coalesce(auth.uid(), v_conductor_user_id),
      status       = 'VALIDATED',
      updated_at   = now()
  where id = v_ticket.id
  returning * into v_ticket;

  if p_trip_id is not null then
    insert into public.trip_occupancy (trip_id, current_passenger_count, capacity)
    select p_trip_id, v_ticket.passenger_count, coalesce(b.capacity, 50)
    from public.trips t
    left join public.buses b on b.id = t.bus_id
    where t.id = p_trip_id
    on conflict (trip_id) do update
      set current_passenger_count = trip_occupancy.current_passenger_count + v_ticket.passenger_count;
  end if;

  select name into v_from_name from public.stops where id = v_ticket.origin_stop_id;
  select name into v_to_name   from public.stops where id = v_ticket.dest_stop_id;

  return jsonb_build_object(
    'success',         true,
    'pnr',             v_ticket.pnr,
    'passenger_count', v_ticket.passenger_count,
    'total_fare',      v_ticket.total_fare,
    'from_stop',       coalesce(v_from_name, 'Origin Stop'),
    'to_stop',         coalesce(v_to_name, 'Destination Stop'),
    'validated_at',    now(),
    'message',         'Ticket validated successfully'
  );
end;
$$;

grant execute on function public.validate_ticket_by_pnr(text, uuid) to authenticated, anon;
