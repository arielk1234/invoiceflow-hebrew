-- ============ ENUMS ============
CREATE TYPE public.business_role AS ENUM ('owner','admin','user');
CREATE TYPE public.doc_type AS ENUM ('invoice','receipt');
CREATE TYPE public.doc_status AS ENUM ('draft','issued','sent','paid','cancelled');

-- ============ BUSINESSES ============
CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  tax_id text NOT NULL DEFAULT '',
  business_type public.business_type NOT NULL DEFAULT 'osek_patur',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  vat_rate numeric(5,2) NOT NULL DEFAULT 18,
  document_prefix text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.business_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
CREATE INDEX business_members_user_idx ON public.business_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_members TO authenticated;
GRANT ALL ON public.business_members TO service_role;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY HELPERS ============
CREATE OR REPLACE FUNCTION public.is_business_member(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = _business_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_business_role(_business_id uuid, _roles public.business_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE business_id = _business_id AND user_id = auth.uid() AND role = ANY(_roles)
  );
$$;

-- ============ BUSINESS POLICIES ============
CREATE POLICY "members read business" ON public.businesses
  FOR SELECT TO authenticated USING (public.is_business_member(id));
CREATE POLICY "owners and admins update business" ON public.businesses
  FOR UPDATE TO authenticated
  USING (public.has_business_role(id, ARRAY['owner','admin']::public.business_role[]))
  WITH CHECK (public.has_business_role(id, ARRAY['owner','admin']::public.business_role[]));
CREATE POLICY "owners delete business" ON public.businesses
  FOR DELETE TO authenticated USING (public.has_business_role(id, ARRAY['owner']::public.business_role[]));

CREATE POLICY "members read memberships" ON public.business_members
  FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "owners manage memberships" ON public.business_members
  FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner']::public.business_role[]));
CREATE POLICY "owners update memberships" ON public.business_members
  FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner']::public.business_role[]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner']::public.business_role[]));
CREATE POLICY "owners remove memberships" ON public.business_members
  FOR DELETE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner']::public.business_role[]));

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  tax_id text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, business_id)
);
CREATE INDEX clients_business_idx ON public.clients(business_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read clients" ON public.clients
  FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "members insert clients" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "members update clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "staff delete clients" ON public.clients
  FOR DELETE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

-- ============ DOCUMENTS ============
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  type public.doc_type NOT NULL DEFAULT 'invoice',
  number text NOT NULL DEFAULT '',
  status public.doc_status NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  vat_rate numeric(5,2) NOT NULL DEFAULT 18,
  notes text NOT NULL DEFAULT '',
  payment_method text NOT NULL DEFAULT '',
  created_by uuid,
  issued_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, number),
  FOREIGN KEY (client_id, business_id) REFERENCES public.clients(id, business_id) ON DELETE RESTRICT
);
CREATE INDEX documents_business_idx ON public.documents(business_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read documents" ON public.documents
  FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY "members insert documents" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "members update documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "staff delete documents" ON public.documents
  FOR DELETE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE TABLE public.document_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_items_document_idx ON public.document_items(document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_items TO authenticated;
GRANT ALL ON public.document_items TO service_role;
ALTER TABLE public.document_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_document(_document_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents d
    JOIN public.business_members m
      ON m.business_id = d.business_id AND m.user_id = auth.uid()
    WHERE d.id = _document_id
  );
$$;

CREATE POLICY "members read document items" ON public.document_items
  FOR SELECT TO authenticated USING (public.can_access_document(document_id));
CREATE POLICY "members insert document items" ON public.document_items
  FOR INSERT TO authenticated WITH CHECK (public.can_access_document(document_id));
CREATE POLICY "members update document items" ON public.document_items
  FOR UPDATE TO authenticated
  USING (public.can_access_document(document_id))
  WITH CHECK (public.can_access_document(document_id));
CREATE POLICY "members delete document items" ON public.document_items
  FOR DELETE TO authenticated USING (public.can_access_document(document_id));

-- ============ SEQUENCES ============
CREATE TABLE public.document_sequences (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  doc_type public.doc_type NOT NULL,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, doc_type, year)
);
GRANT SELECT ON public.document_sequences TO authenticated;
GRANT ALL ON public.document_sequences TO service_role;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read sequences" ON public.document_sequences
  FOR SELECT TO authenticated USING (public.is_business_member(business_id));

-- ============ AUDIT ============
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  actor_user_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_business_idx ON public.audit_events(business_id, created_at DESC);
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read audit" ON public.audit_events
  FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE OR REPLACE FUNCTION public.log_audit(_business_id uuid, _action text, _entity text, _entity_id uuid, _payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_events (business_id, actor_user_id, action, entity, entity_id, payload)
  VALUES (_business_id, auth.uid(), _action, _entity, _entity_id, COALESCE(_payload, '{}'::jsonb));
END;
$$;

-- ============ BUSINESS BOOTSTRAP ============
CREATE OR REPLACE FUNCTION public.create_business(
  _name text, _tax_id text, _business_type public.business_type,
  _address text DEFAULT '', _phone text DEFAULT '', _email text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  INSERT INTO public.businesses (name, tax_id, business_type, address, phone, email)
  VALUES (COALESCE(_name,''), COALESCE(_tax_id,''), COALESCE(_business_type,'osek_patur'),
          COALESCE(_address,''), COALESCE(_phone,''), COALESCE(_email,''))
  RETURNING id INTO _id;
  INSERT INTO public.business_members (business_id, user_id, role) VALUES (_id, _uid, 'owner');
  PERFORM public.log_audit(_id, 'create', 'business', _id, '{}'::jsonb);
  RETURN _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_business(text, text, public.business_type, text, text, text) TO authenticated;

-- ============ ATOMIC NUMBERING ============
CREATE OR REPLACE FUNCTION public.next_document_number(_business_id uuid, _type public.doc_type)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _year integer := EXTRACT(YEAR FROM CURRENT_DATE)::int;
        _n integer;
        _prefix text;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  INSERT INTO public.document_sequences (business_id, doc_type, year, last_number)
  VALUES (_business_id, _type, _year, 1)
  ON CONFLICT (business_id, doc_type, year)
  DO UPDATE SET last_number = public.document_sequences.last_number + 1
  RETURNING last_number INTO _n;

  SELECT NULLIF(document_prefix, '') INTO _prefix FROM public.businesses WHERE id = _business_id;
  RETURN COALESCE(_prefix || '-', '')
         || CASE WHEN _type = 'receipt' THEN 'K-' ELSE '' END
         || _year::text || '-' || LPAD(_n::text, 3, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_document_number(uuid, public.doc_type) TO authenticated;

-- numbers are always server-assigned; client input is ignored
CREATE OR REPLACE FUNCTION public.documents_assign_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.number := public.next_document_number(NEW.business_id, NEW.type);
  RETURN NEW;
END;
$$;
CREATE TRIGGER documents_assign_number_trg BEFORE INSERT ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.documents_assign_number();

-- ============ IMMUTABILITY ============
CREATE OR REPLACE FUNCTION public.documents_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.number := OLD.number;
  NEW.business_id := OLD.business_id;
  NEW.created_by := OLD.created_by;
  IF OLD.status <> 'draft' THEN
    IF NEW.status = 'draft' THEN RAISE EXCEPTION 'DOCUMENT_LOCKED'; END IF;
    IF NEW.type <> OLD.type OR NEW.client_id <> OLD.client_id
       OR NEW.issue_date <> OLD.issue_date OR NEW.due_date <> OLD.due_date
       OR NEW.vat_rate <> OLD.vat_rate THEN
      RAISE EXCEPTION 'DOCUMENT_LOCKED';
    END IF;
  END IF;
  IF NEW.status <> OLD.status THEN
    IF NEW.status = 'cancelled' THEN NEW.cancelled_at := now(); END IF;
    IF OLD.status = 'draft' THEN NEW.issued_at := now(); END IF;
    PERFORM public.log_audit(OLD.business_id, 'status_change', 'document', OLD.id,
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER documents_guard_update_trg BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.documents_guard_update();

CREATE OR REPLACE FUNCTION public.documents_guard_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'ISSUED_DOCUMENT_CANNOT_BE_DELETED'; END IF;
  PERFORM public.log_audit(OLD.business_id, 'delete', 'document', OLD.id, '{}'::jsonb);
  RETURN OLD;
END;
$$;
CREATE TRIGGER documents_guard_delete_trg BEFORE DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.documents_guard_delete();

CREATE OR REPLACE FUNCTION public.document_items_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _status public.doc_status; _doc uuid;
BEGIN
  _doc := COALESCE(NEW.document_id, OLD.document_id);
  SELECT status INTO _status FROM public.documents WHERE id = _doc;
  IF _status IS NOT NULL AND _status <> 'draft' THEN RAISE EXCEPTION 'DOCUMENT_LOCKED'; END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER document_items_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.document_items
FOR EACH ROW EXECUTE FUNCTION public.document_items_guard();

-- ============ CANCELLATION RPC ============
CREATE OR REPLACE FUNCTION public.cancel_document(_document_id uuid, _reason text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _biz uuid; _status public.doc_status;
BEGIN
  SELECT business_id, status INTO _biz, _status FROM public.documents WHERE id = _document_id FOR UPDATE;
  IF _biz IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.has_business_role(_biz, ARRAY['owner','admin']::public.business_role[]) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _status = 'cancelled' THEN RETURN; END IF;
  UPDATE public.documents SET status = 'cancelled' WHERE id = _document_id;
  PERFORM public.log_audit(_biz, 'cancel', 'document', _document_id, jsonb_build_object('reason', _reason));
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_document(uuid, text) TO authenticated;