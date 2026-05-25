
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS parent_invoice_id uuid REFERENCES public.invoices(id),
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'sale';

CREATE OR REPLACE FUNCTION public.process_return(_invoice_id uuid, _reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src RECORD;
  itm RECORD;
  new_id uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO src FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF src.type = 'return' THEN RAISE EXCEPTION 'Cannot return a return'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE parent_invoice_id = _invoice_id) THEN
    RAISE EXCEPTION 'Invoice already returned';
  END IF;

  INSERT INTO public.invoices (customer_id, cashier_id, subtotal, tax, discount, total, payment_type, status, notes, type, parent_invoice_id)
  VALUES (src.customer_id, auth.uid(), -src.subtotal, -src.tax, -src.discount, -src.total, src.payment_type, 'refunded', COALESCE(_reason, 'مرتجع'), 'return', src.id)
  RETURNING id INTO new_id;

  FOR itm IN SELECT * FROM public.invoice_items WHERE invoice_id = _invoice_id LOOP
    INSERT INTO public.invoice_items (invoice_id, product_id, product_name, qty, price, total)
    VALUES (new_id, itm.product_id, itm.product_name, -itm.qty, itm.price, -itm.total);

    IF itm.product_id IS NOT NULL THEN
      UPDATE public.products SET stock = stock + itm.qty, updated_at = now() WHERE id = itm.product_id;
    END IF;
  END LOOP;

  UPDATE public.invoices SET status = 'refunded' WHERE id = _invoice_id;

  IF src.customer_id IS NOT NULL AND src.payment_type = 'credit' THEN
    UPDATE public.customers SET balance = balance - src.total WHERE id = src.customer_id;
  END IF;

  INSERT INTO public.activity_logs (user_id, action, entity, details)
  VALUES (auth.uid(), 'return_invoice', 'invoices', jsonb_build_object('invoice_id', _invoice_id, 'return_id', new_id, 'reason', _reason));

  INSERT INTO public.notifications (title, message, type)
  VALUES ('مرتجع فاتورة', 'تم إرجاع الفاتورة #' || src.invoice_no, 'warning');

  RETURN new_id;
END;
$$;
