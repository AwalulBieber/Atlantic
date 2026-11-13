-- Allow signed-in Atlantic users to access profile rows through the Supabase Data API.
-- Row visibility and ownership remain controlled by the existing profiles RLS policies.
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
