/**
    * Sprint 1.3 — Tenant isolation harness.
    *
    * Run against a freshly-provisioned Supabase project (or a `supabase
    * start` local stack) AFTER applying:
    *   supabase/migrations/20260612_tenancy_v1.sql
    *   supabase/migrations/20260612_tenant_rls_v1.sql
    *
    * Setup:
    *   1. supabase start                 # local stack
    *   2. psql $DATABASE_URL -f supabase/migrations/20260612_tenancy_v1.sql
    *   3. psql $DATABASE_URL -f supabase/migrations/20260612_tenant_rls_v1.sql
    *   4. DATABASE_URL_TEST=postgres://... bunx vitest run tests/rls.test.ts
    *
    * The harness uses service-role to set up baseline data, then switches
    * into a per-user RLS context with `set_config('request.jwt.claims',
    * json, true)` to simulate live role behavior.
    *
    * Pass criterion: every `expect(...).toBe()` and `.toEqual()` assertion
    * holds. ANY cross-tenant row leak — read or write — fails the suite.
    */
   import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
   import { Pool } from "pg";

   const url = process.env.DATABASE_URL_TEST;
   if (!url) {
     throw new Error("DATABASE_URL_TEST is required. See header comment.");
   }
   const admin = new Pool({ connectionString: url });

   // -- helpers --------------------------------------------------------------

   /** Run `fn` with the given jwt claims active via SET LOCAL. */
   async function asUser<T>(
     claims: { sub: string; role?: string },
     fn: (client: import("pg").PoolClient) => Promise<T>,
   ): Promise<T> {
     const client = await admin.connect();
     try {
       await client.query("BEGIN");
       await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
         JSON.stringify(claims),
       ]);
       const result = await fn(client);
       await client.query("ROLLBACK");
       return result;
     } catch (e) {
       await client.query("ROLLBACK");
       throw e;
     } finally {
       client.release();
     }
   }

   /** Insert as service-role (bypasses RLS) and return the row. */
   async function adminInsert<T extends Record<string, unknown>>(
     client: import("pg").PoolClient,
     table: string,
     row: T,
   ): Promise<T & { id: string }> {
     const cols = Object.keys(row);
     const values = cols.map((_, i) => `$${i + 1}`);
     const sql = `INSERT INTO public.${table} (${cols.map(c => `"${c}"`).join(",")})
                  VALUES (${values.join(",")}) RETURNING *`;
     const result = await client.query(sql, Object.values(row));
     return result.rows[0];
   }

   // -- shared fixture ids ---------------------------------------------------

   let tenantA: string;
   let tenantB: string;
   let userA: string;
   let userB: string;
   let roleA: string;
   let roleB: string;

   beforeAll(async () => {
     // We need real auth.users rows because tenant_members.user_id FKs to it.
     // Service-role inserts into auth.users are the standard pattern.
     const tenant = await admin.query(
       `INSERT INTO public.tenants (slug, name) VALUES
         ('test-a-${Date.now()}', 'Tenant A'),
         ('test-b-${Date.now()}', 'Tenant B')
        RETURNING id, slug`,
     );
     tenantA = tenant.rows[0].id;
     tenantB = tenant.rows[1].id;

     const users = await admin.query(
       `INSERT INTO auth.users (id, instance_id, aud, role, email)
        VALUES
          (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
          (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local')
        RETURNING id`,
     );
     userA = users.rows[0].id;
     userB = users.rows[1].id;

     const members = await admin.query(
       `INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES
         ($1, $2, 'owner'),
         ($3, $4, 'owner')
        RETURNING role, tenant_id`,
       [tenantA, userA, tenantB, userB],
     );
     roleA = members.rows[0].role;
     roleB = members.rows[1].role;
   });

   afterAll(async () => {
     // Cascade: tenant_members + (manually) tenant rows drop auth.users
     await admin.query("DELETE FROM public.tenants WHERE id IN ($1, $2)", [
       tenantA,
       tenantB,
     ]);
     await admin.end();
   });

   // -- per-test data -------------------------------------------------------

   let orderA: string;
   let orderB: string;

   beforeEach(async () => {
     const customerA = await admin.query(
       "INSERT INTO public.customers (name, phone, tenant_id) VALUES ($1, $2, $3) RETURNING id",
       ["Customer A", "+201000000001", tenantA],
     );
     const customerB = await admin.query(
       "INSERT INTO public.customers (name, phone, tenant_id) VALUES ($1, $2, $3) RETURNING id",
       ["Customer B", "+201000000002", tenantB],
     );
     const o = await admin.query(
       `INSERT INTO public.orders
         (order_number, customer_id, total, tenant_id)
        VALUES
         ('A-${Date.now()}', $1, 100, $2),
         ('B-${Date.now()}', $3, 200, $4)
        RETURNING id, tenant_id`,
       [
         customerA.rows[0].id,
         tenantA,
         customerB.rows[0].id,
         tenantB,
       ],
     );
     orderA = o.rows[0].id;
     orderB = o.rows[1].id;
   });

   // -- the actual assertions ------------------------------------------------

   describe("tenant isolation", () => {
     it("a member can see only their own tenant's order", async () => {
       const seen = await asUser({ sub: userA }, async c => {
         const r = await c.query("SELECT id FROM public.orders");
         return r.rows.map((row: { id: string }) => row.id);
       });
       expect(seen).toContain(orderA);
       expect(seen).not.toContain(orderB);
     });

     it("inserting a row with a foreign tenant_id fails RLS", async () => {
       let err: unknown = null;
       try {
         await asUser({ sub: userA }, async c => {
           await c.query(
             "INSERT INTO public.orders (order_number, customer_id, total, tenant_id) VALUES ($1, $2, $3, $4)",
             [`BAD-${Date.now()}`, null, 0, tenantB],
           );
         });
       } catch (e) {
         err = e;
       }
       expect(String(err)).toMatch(/row-level security|policy|tenant/);
     });

     it("a worker cannot UPDATE a customer they don't own", async () => {
       // Promote userA to worker for tenant A.
       await admin.query(
         "UPDATE public.tenant_members SET role='worker' WHERE tenant_id=$1 AND user_id=$2",
         [tenantA, userA],
       );
       let err: unknown = null;
       try {
         await asUser({ sub: userA }, async c => {
           await c.query("UPDATE public.customers SET name='hax' WHERE id IN (SELECT id FROM public.customers LIMIT 1)");
         });
       } catch (e) {
         err = e;
       } finally {
         // Reset role.
         await admin.query(
           "UPDATE public.tenant_members SET role='owner' WHERE tenant_id=$1 AND user_id=$2",
           [tenantA, userA],
         );
       }
       expect(String(err)).toMatch(/row-level security|policy|permission/);
     });

     it("appending to notification_log works for own tenant; foreign tenant insert fails", async () => {
       const okLog = await asUser({ sub: userA }, async c => {
         const r = await c.query(
           "INSERT INTO public.notification_log (event, entity_type, channel, tenant_id) VALUES ($1, $2, $3, $4) RETURNING id",
           ["e", "order", "email", tenantA],
         );
         return r.rowCount;
       });
       expect(okLog).toBe(1);

       const failLog = await asUser({ sub: userA }, async c => {
         return c.query(
           "INSERT INTO public.notification_log (event, entity_type, channel, tenant_id) VALUES ($1, $2, $3, $4)",
           ["e", "order", "email", tenantB],
         ).then(() => "ok").catch(e => String(e));
       });
       expect(failLog).not.toBe("ok");
     });

     it("DELETE on append-only tables is forbidden", async () => {
       const result = await asUser({ sub: userA }, async c => {
         return c
           .query("DELETE FROM public.notification_log")
           .then(() => "ok")
           .catch(e => String(e));
       });
       expect(result).not.toBe("ok");
     });

     it("UPDATE on append-only tables is forbidden", async () => {
       const result = await asUser({ sub: userA }, async c => {
         return c
           .query("UPDATE public.audit_log SET action='hax'")
           .then(() => "ok")
           .catch(e => String(e));
       });
       expect(result).not.toBe("ok");
     });
   });