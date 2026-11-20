# Supabase setup handoff

This folder prepares the database contract for the Supabase project owner.

1. Create a Supabase project and run [`schema.sql`](./schema.sql) in the SQL Editor.
2. Deploy an Edge Function at `POST /functions/v1/telemetry-ingest`.
3. Configure the function to validate `x-device-token`, validate `device_id`/`pond_id` and sensor values, and insert into `public.telemetry`.
4. Store the Supabase `service_role` key only as an Edge Function secret. Do not put it in Flutter, ESP32 firmware, or this repository.
5. The MVP SQL grants anonymous read access to telemetry so the app can work without a login screen. Telemetry will therefore be publicly readable to anyone with the project URL and anon key. Replace this policy with authenticated, pond-scoped RLS before storing sensitive data.
6. Configure Flutter at build/run time:

   ```bash
   flutter run \
     --dart-define=SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
     --dart-define=SUPABASE_ANON_KEY=YOUR_LEGACY_ANON_JWT_KEY
   ```

   Use the public anon key (not the service-role key). The client reads initial/history data over REST and subscribes to inserts with Supabase Realtime over WSS.
7. Copy [`firmware/esp32_aquapenaeus_c45/secrets.example.h`](../firmware/esp32_aquapenaeus_c45/secrets.example.h) to `secrets.h` in the same folder, then fill Wi-Fi, project URL, anon key, device token, and the Supabase TLS root CA. The PEM certificate must be a C string with newline escapes (`\n`). `secrets.h` is ignored by Git.
8. Configure the Edge Function to accept the public `apikey` header and validate the per-device `x-device-token` header. Deploy this endpoint with JWT verification disabled only if the function strictly validates the device token itself.

The firmware sends once every 10 minutes. Realtime delivers a new row to the app after that row is accepted; it does not change the sensor sampling interval. MQTT is not part of this design.
