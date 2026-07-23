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
