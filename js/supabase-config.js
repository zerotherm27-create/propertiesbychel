/* Properties by Chel — Supabase connection
 *
 * SETUP (one time):
 *   1. Create a project at https://supabase.com (free tier is fine).
 *   2. In the project: SQL Editor → paste and run  supabase/schema.sql  from this repo.
 *   3. Project Settings → API: copy the Project URL and the anon/publishable key below.
 *   4. Set OWNER_EMAIL to the email address the owner will log into the dashboard with
 *      (it must match — database policies grant write access to this address only).
 *
 * The anon key is designed to be public; row-level security enforces what it can do.
 * While these values are empty the site still works: forms simulate success locally
 * and pages show their built-in sample content.
 */
window.SUPABASE_CONFIG = {
  url: "https://ndoiommnmkeoukxbnobp.supabase.co",
  anonKey: "sb_publishable_u3EntIBoaYn83t3sDXaL2g_kzgnZMT8",
  ownerEmail: "concierge@propertiesbychel.com",
  // AI research/draft/image server for the dashboard's Content tab (see server/).
  contentAgentUrl: "https://propertiesbychel-content-agent-production.up.railway.app"
};

/* Google Maps (listing detail pages)
 *   1. console.cloud.google.com → create/select a project → APIs & Services →
 *      Library → enable "Maps JavaScript API".
 *   2. Link a billing account (required by Google even though normal small-site
 *      traffic stays inside the $200/month free credit).
 *   3. Credentials → Create Credentials → API key.
 *   4. Restrict the key: Application restrictions → HTTP referrers → add your
 *      site's domain (and localhost if testing locally). API restrictions →
 *      limit to "Maps JavaScript API" only.
 * This key is meant to be public/client-side, same as the Supabase anon key
 * above — the HTTP-referrer restriction is what protects it, not secrecy.
 * While apiKey is empty, listings simply show no map section.
 */
window.GOOGLE_MAPS_CONFIG = {
  apiKey: "AIzaSyDByG1ucJioayzuTGa_PoUhBXGcLuhx0eA"
};

/* Google Drive picker (dashboard: choose listing photos straight from Drive)
 *   1. console.cloud.google.com → same project as above → APIs & Services →
 *      Library → enable "Google Picker API" and "Google Drive API".
 *   2. Credentials → Create Credentials → API key. Restrict it the same way
 *      as the Maps key (HTTP referrers → your domain + localhost).
 *   3. Credentials → Create Credentials → OAuth client ID → Web application.
 *      Add your dashboard's origin(s) under "Authorized JavaScript origins"
 *      (e.g. https://propertiesbychel.com and http://localhost:xxxx).
 *   4. OAuth consent screen → add the owner's Google account as a test user
 *      (or publish the app) so sign-in works.
 * Both values are public/client-side, same as the keys above. While either
 * is empty, the "Choose from Google Drive" buttons tell the user it isn't
 * configured yet instead of failing silently.
 */
window.GOOGLE_DRIVE_CONFIG = {
  apiKey: "AIzaSyCzdjVRHVPLqVZJNSeW1aAJAvqTH5BRT_8",
  clientId: "882807325111-pbonmn0nga7khne7qtg1oh3qq6s9ahmm.apps.googleusercontent.com"
};
