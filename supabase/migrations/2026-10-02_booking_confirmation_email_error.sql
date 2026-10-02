-- Records why a booking confirmation email wasn't sent (flitt-callback). Safe to re-run.
alter table public.bookings add column if not exists confirmation_email_error text null;
