/**
 * Disposable PGlite test fixture ONLY. Never import this into server/app code.
 *
 * The historical platform_bootstrap_dishbee_pilot() RPC now fails closed.
 * These tests need explicitly authorised synthetic data in their own transient
 * in-memory database; this helper is not a production provisioner.
 */
export async function seedIsolatedDishbeeTestTenants(db, adminUserId) {
  // PGlite is bundled/minified on CI and its constructor.name is not
  // guaranteed to be "PGlite". Restrict this helper to verification/ imports
  // and require the explicit in-memory test adapter API instead.
  if (!db || typeof db.query !== "function" || typeof db.exec !== "function") {
    throw new Error("isolated_sql_test_adapter_required");
  }
  if (!/^[0-9a-f-]{36}$/i.test(adminUserId)) {
    throw new Error("invalid_fixture_admin_id");
  }

  const org = (await db.query(
    `INSERT INTO public.organisations(name,slug,country_code,billing_currency)
     VALUES('Synthetic Demo Group','test-only-dishbee-pilot','GB','GBP')
     ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name
     RETURNING id`,
  )).rows[0].id;

  await db.query(
    `INSERT INTO public.organisation_members(organisation_id,user_id,role)
     VALUES($1,$2,'owner') ON CONFLICT (organisation_id,user_id)
     DO UPDATE SET role='owner'`,
    [org,adminUserId],
  );

  const specs=[
    {tenantName:"Cafe 1 St Albans (test only)",tenantSlug:"cafe1-st-albans",blueprint:"restaurant-uk",brand:"cafe-1"},
    {tenantName:"Cafe 1 Luton (test only)",tenantSlug:"cafe1-luton",blueprint:"restaurant-uk",brand:"cafe-1"},
    {tenantName:"MealDeck (test only)",tenantSlug:"mealdeck",blueprint:"mealdeck-uk",brand:"mealdeck"},
  ];
  const tenants=[];

  for(const item of specs){
    const tenantId=(await db.query(
      `INSERT INTO public.tenants(name,slug,organisation_id,country_code,currency,timezone,status)
       VALUES($1,$2,$3,'GB','GBP','Europe/London','active')
       ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name
       RETURNING id`,[item.tenantName,item.tenantSlug,org],
    )).rows[0].id;
    await db.query(
      `INSERT INTO public.tenant_members(tenant_id,user_id,role)
       VALUES($1,$2,'owner') ON CONFLICT(tenant_id,user_id)
       DO UPDATE SET role='owner'`,[tenantId,adminUserId],
    );
    tenants.push({...item,tenantId});
  }

  await db.exec("BEGIN; SET LOCAL ROLE authenticated;");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[adminUserId]);
  try {
    for(const item of tenants){
      await db.query("SELECT public.platform_apply_blueprint($1,$2)",[item.tenantId,item.blueprint]);
      const brandId=(await db.query(
        "SELECT public.platform_upsert_tenant_brand($1,$2,$3,$4,true,NULL,'{}'::jsonb) AS id",
        [item.tenantId,item.tenantSlug==="mealdeck"?"mealdeck":"dishbee",item.tenantName,item.brand],
      )).rows[0].id;
      const places=item.tenantSlug==="cafe1-luton"
        ?[["Luton Crown Court","luton-crown-court"],["Futures House","futures-house"]]
        :item.tenantSlug==="cafe1-st-albans"
          ?[["St Albans Crown Court","st-albans-crown-court"]]:[];
      for(const [name,code] of places){
        await db.query(
          "SELECT public.platform_upsert_tenant_location($1,$2,$3,$4,'Europe/London','{}'::jsonb,'active')",
          [item.tenantId,brandId,name,code],
        );
      }
    }
    await db.exec("COMMIT");
  }catch(error){await db.exec("ROLLBACK");throw error;}

  return {
    organisationId:org,
    organisationSlug:"test-only-dishbee-pilot",
    landlordProductKey:"dishbee",
    tenants:tenants.map(t=>({
      tenantId:t.tenantId,tenantName:t.tenantName,tenantSlug:t.tenantSlug,
      blueprint:t.blueprint,
    })),
  };
}
