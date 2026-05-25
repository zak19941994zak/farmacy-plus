
CREATE OR REPLACE FUNCTION public.create_invoice(
  _customer_id uuid,
  _payment_type text,
  _discount numeric,
  _tax numeric,
  _notes text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  item jsonb;
  _subtotal numeric := 0;
  _total numeric;
  _qty numeric;
  _price numeric;
  _pid uuid;
  _pname text;
  _line_total numeric;
  _current_stock numeric;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'No items provided';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (item->>'qty')::numeric;
    _price := (item->>'price')::numeric;
    _subtotal := _subtotal + (_qty * _price);
  END LOOP;

  _total := GREATEST(0, _subtotal + COALESCE(_tax,0) - COALESCE(_discount,0));

  INSERT INTO public.invoices (
    customer_id, cashier_id, subtotal, tax, discount, total,
    payment_type, status, notes, type
  ) VALUES (
    _customer_id, auth.uid(), _subtotal, COALESCE(_tax,0), COALESCE(_discount,0), _total,
    _payment_type,
    CASE WHEN _payment_type = 'credit' THEN 'unpaid' ELSE 'paid' END,
    _notes, 'sale'
  ) RETURNING id INTO new_id;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _pid := NULLIF(item->>'product_id','')::uuid;
    _pname := item->>'product_name';
    _qty := (item->>'qty')::numeric;
    _price := (item->>'price')::numeric;
    _line_total := _qty * _price;

    INSERT INTO public.invoice_items (invoice_id, product_id, product_name, qty, price, total)
    VALUES (new_id, _pid, _pname, _qty, _price, _line_total);

    IF _pid IS NOT NULL THEN
      SELECT stock INTO _current_stock FROM public.products WHERE id = _pid FOR UPDATE;
      IF _current_stock IS NULL THEN
        RAISE EXCEPTION 'Product not found: %', _pid;
      END IF;
      IF _current_stock < _qty THEN
        RAISE EXCEPTION 'Insufficient stock for product %', _pname;
      END IF;
      UPDATE public.products SET stock = stock - _qty, updated_at = now() WHERE id = _pid;
    END IF;
  END LOOP;

  IF _customer_id IS NOT NULL AND _payment_type = 'credit' THEN
    UPDATE public.customers SET balance = balance + _total WHERE id = _customer_id;
  END IF;

  INSERT INTO public.activity_logs (user_id, action, entity, entity_id, details)
  VALUES (auth.uid(), 'create_invoice', 'invoices', new_id,
    jsonb_build_object('total', _total, 'payment_type', _payment_type));

  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_invoice(uuid, text, numeric, numeric, text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_invoice(uuid, text, numeric, numeric, text, jsonb) TO authenticated;
