
-- Update is_staff to exclude pending users
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role <> 'pending'::app_role
  )
$$;

-- New users get 'pending' role (first user remains owner)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_count INT;
  assigned_role app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count <= 1 THEN
    assigned_role := 'owner';
  ELSE
    assigned_role := 'pending';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END;
$$;

-- Activity log spoofing fix
DROP POLICY IF EXISTS staff_write_logs ON public.activity_logs;
CREATE POLICY staff_write_logs
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (is_staff(auth.uid()) AND user_id = auth.uid());

-- Realtime authorization
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_realtime_select" ON realtime.messages;
CREATE POLICY "staff_realtime_select"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.is_staff((SELECT auth.uid())));
