-- =============================================================================
-- 010: Security hardening
--
-- 1. Revoke the PUBLIC execute grant Postgres adds to every new function by
--    default. Migration 008's `grant execute ... to authenticated` (or
--    `anon, authenticated`) statements were previously decorative — anon
--    could already call every RPC via the inherited PUBLIC privilege. Each
--    function's own in-body checks (is_admin/is_conductor_for_trip/auth.uid
--    is null) happened to make this unexploitable so far, but it left zero
--    margin for a future RPC added without such a check.
-- 2. Column-scope UPDATE on `trips` so a conductor (or any authenticated
--    caller) can only ever change `status`/`current_stop_id` via a direct
--    REST update — reassigning `conductor_id`/`bus_id`/`route_id` etc. now
--    fails at the grant level regardless of what the RLS predicate allows.
--    No existing client code updates other trips columns directly (that
--    always goes through a SECURITY DEFINER RPC, which bypasses grants), so
--    this doesn't remove any real capability.
-- 3. Make QR ticket validation genuinely check something client-supplied
--    instead of comparing two values both read from the same DB row.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Correct an overclaim from migration 003's comment: create_secure_ticket
--    never actually validated the UPI id itself (only whether payments are
--    enabled at all) — there was nothing for it to check against, since the
--    client never sends a UPI id. Documented here via COMMENT ON rather than
--    editing the historical migration 003 file text.
-- -----------------------------------------------------------------------------
comment on table transport_authority_config is
  'Single-row config read by create_secure_ticket() to check whether ticket '
  'payments are enabled at all (is_payments_enabled). upi_id is DISPLAY-ONLY '
  '— shown by the mock payment UI — and is not itself validated server-side, '
  'since the mock payment flow never sends one to compare against.';

-- -----------------------------------------------------------------------------
-- 1. Revoke dangling PUBLIC execute grants
-- -----------------------------------------------------------------------------
revoke all on function find_nearest_stop(double precision, double precision, int) from public;
revoke all on function list_eligible_buses(uuid, uuid) from public;
revoke all on function create_secure_ticket(uuid, uuid, uuid, int) from public;
revoke all on function validate_ticket(text, uuid) from public;
revoke all on function depart_stop_and_expire_tickets(uuid, uuid) from public;
revoke all on function start_trip(uuid) from public;
revoke all on function link_conductor_account(uuid, uuid) from public;

-- Re-grant exactly what migration 008 intended (now the ONLY grant in effect).
grant execute on function find_nearest_stop(double precision, double precision, int) to anon, authenticated;
grant execute on function list_eligible_buses(uuid, uuid) to anon, authenticated;
grant execute on function create_secure_ticket(uuid, uuid, uuid, int) to authenticated;
grant execute on function validate_ticket(text, uuid) to authenticated;
grant execute on function depart_stop_and_expire_tickets(uuid, uuid) to authenticated;
grant execute on function start_trip(uuid) to authenticated;
grant execute on function link_conductor_account(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Column-scope trips UPDATE
-- -----------------------------------------------------------------------------
revoke update on trips from authenticated;
grant update (status, current_stop_id) on trips to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Non-tautological QR signature check.
--
-- The QR now encodes "<qr_payload>.<qr_signature>" (see
-- apps/passenger/src/pages/TicketPage.tsx). qr_payload is base64
-- (gen_random_bytes(24)), whose alphabet never contains '.', so splitting on
-- the first '.' unambiguously separates payload from signature.
--
-- The signature compared here now originates from the scanned QR text
-- itself, not from a second read of the same tickets row — closing the
-- tautology where both sides of the comparison were DB-sourced.
-- -----------------------------------------------------------------------------
create or replace function validate_ticket(
  p_qr_payload text,
  p_trip_id uuid
)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanned_payload text;
  v_scanned_signature text;
  v_ticket tickets;
  v_hmac_key text;
  v_expected_signature text;
begin
  if not is_conductor_for_trip(p_trip_id) then
    raise exception 'NOT_AUTHORIZED: caller is not the active conductor for this trip';
  end if;

  v_scanned_payload := split_part(p_qr_payload, '.', 1);
  v_scanned_signature := split_part(p_qr_payload, '.', 2);

  if v_scanned_payload = '' or v_scanned_signature = '' then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  select * into v_ticket from tickets where qr_payload = v_scanned_payload for update;

  if v_ticket is null then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  -- Primary check: does the signature actually printed on/encoded in the
  -- scanned QR match what we stored for this ticket?
  if v_scanned_signature <> v_ticket.qr_signature then
    raise exception 'TICKET_SIGNATURE_INVALID';
  end if;

  -- Secondary check (defense in depth): re-derive the signature from the
  -- server-held secret to catch a directly-tampered DB row (only reachable
  -- via service-role access, but cheap to verify).
  select value into v_hmac_key from app_secrets where name = 'ticket_qr_hmac_key';
  v_expected_signature := encode(extensions.hmac(v_ticket.qr_payload || '|' || v_ticket.trip_id::text, v_hmac_key, 'sha256'), 'hex');
  if v_expected_signature <> v_ticket.qr_signature then
    raise exception 'TICKET_SIGNATURE_INVALID';
  end if;

  if v_ticket.trip_id <> p_trip_id then
    raise exception 'WRONG_TRIP: ticket was issued for a different trip/bus';
  end if;

  if v_ticket.status = 'VALIDATED' then
    raise exception 'ALREADY_VALIDATED';
  end if;

  if v_ticket.status = 'EXPIRED' or v_ticket.expires_at < now() then
    raise exception 'TICKET_EXPIRED';
  end if;

  if v_ticket.status = 'CANCELLED' then
    raise exception 'TICKET_CANCELLED';
  end if;

  if v_ticket.status <> 'PAID' then
    raise exception 'TICKET_NOT_PAID';
  end if;

  update tickets set status = 'VALIDATED', validated_at = now()
  where id = v_ticket.id
  returning * into v_ticket;

  insert into trip_occupancy (trip_id, current_passenger_count, capacity)
  select p_trip_id, v_ticket.passenger_count, b.capacity
  from trips t join buses b on b.id = t.bus_id
  where t.id = p_trip_id
  on conflict (trip_id) do update
    set current_passenger_count = trip_occupancy.current_passenger_count + v_ticket.passenger_count;

  return v_ticket;
end;
$$;

revoke all on function validate_ticket(text, uuid) from public;
grant execute on function validate_ticket(text, uuid) to authenticated;
