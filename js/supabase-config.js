/* =========================================================
   KẾT NỐI SUPABASE
   Publishable key được phép để công khai trong web.
   KHÔNG BAO GIỜ dán key "service_role" / "secret" vào đây.
   ========================================================= */
window.SUPABASE_URL = "https://ujrgjdjpkdngsqxkriam.supabase.co";
window.SUPABASE_KEY = "sb_publishable_UX0fb_qDxPkmHNa58Rt8cg_8z43wnkl";
window.SUPABASE_BUCKET = "images";

window.sb = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY)
  : null;
