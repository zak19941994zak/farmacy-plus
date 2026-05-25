
REVOKE EXECUTE ON FUNCTION public.process_return(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.process_return(uuid, text) TO authenticated;
