/*
  # RLS Policy Reset for Core Tables

  This migration resets and standardizes the RLS policies for the `profiles` and `transactions` tables to ensure correct data access for authenticated users. This is intended to fix data loading issues caused by incorrect or conflicting policies.

  1.  **Summary of Changes**
      - All existing RLS policies on both `profiles` and `transactions` tables will be dropped to prevent conflicts.
      - RLS will be explicitly enabled on both tables.
      - New, permissive policies will be created for authenticated users to perform necessary actions.

  2.  **`profiles` Table Policies (Full CRUD)**
      - `SELECT`: Authenticated users can read all profiles.
      - `INSERT`: Authenticated users can create new profiles.
      - `UPDATE`: Authenticated users can update any profile.
      - `DELETE`: Authenticated users can delete any profile.

  3.  **`transactions` Table Policies (Read/Create)**
      - `SELECT`: Authenticated users can read all transactions.
      - `INSERT`: Authenticated users can create new transactions.

  4.  **Security Rationale**
      - These policies grant broad access to authenticated users, which is suitable for this application's model where any logged-in user is a trusted fund manager with full data visibility and management capabilities.
*/

-- === PROFILES TABLE ===

-- Step 1: Drop all existing policies on the profiles table to ensure a clean slate.
DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname FROM pg_policy WHERE polrelid = 'public.profiles'::regclass
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(policy_name) || ' ON public.profiles;';
    END LOOP;
END $$;

-- Step 2: Enable RLS if not already enabled.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- Step 3: Create full CRUD policies for authenticated users on the profiles table.
CREATE POLICY "Allow authenticated users to view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to insert new profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated users to update profiles" ON public.profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated users to delete profiles" ON public.profiles FOR DELETE TO authenticated USING (true);


-- === TRANSACTIONS TABLE ===

-- Step 1: Drop all existing policies on the transactions table.
DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname FROM pg_policy WHERE polrelid = 'public.transactions'::regclass
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(policy_name) || ' ON public.transactions;';
    END LOOP;
END $$;

-- Step 2: Enable RLS if not already enabled.
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;

-- Step 3: Create SELECT and INSERT policies for authenticated users on the transactions table.
CREATE POLICY "Allow authenticated users to read all transactions" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to insert new transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (true);
