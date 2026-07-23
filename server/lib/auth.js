// Verifies the caller is the signed-in site owner before allowing an
// expensive OpenAI call. The dashboard sends the visitor's own Supabase
// access token (from its already-authenticated session); we hand it back
// to Supabase's auth endpoint to resolve the email, then check it against
// OWNER_EMAIL. No Supabase secret key is needed on this server.
export function requireOwner(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing authorization" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const ownerEmail = (process.env.OWNER_EMAIL || "").toLowerCase();
  if (!supabaseUrl || !anonKey || !ownerEmail) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey }
  })
    .then(async (r) => {
      if (!r.ok) return res.status(401).json({ error: "Invalid session" });
      const user = await r.json();
      if ((user.email || "").toLowerCase() !== ownerEmail) {
        return res.status(403).json({ error: "Not authorized" });
      }
      next();
    })
    .catch(() => res.status(401).json({ error: "Auth check failed" }));
}
