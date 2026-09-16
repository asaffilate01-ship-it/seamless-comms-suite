import unittest
from transformation.product import validate, prioritise, product_report, release_readiness
from knowledge_core.types import APIError

def opportunity(id="o1",**kw):
    return {"id":id,"title":"Improve onboarding","owner":"pm","reach":"100","reach_period":"2026-Q4","reach_population":"new accounts","impact":"2","confidence_percent":"80","effort_person_months":"2","moscow":"should","jtbd":"When joining, I want clear setup steps so I can activate","evidence_ref":"urn:research:1","status":"discovery",**kw}

class ProductTests(unittest.TestCase):
    def test_rice_known_score_and_separate_population(self):
        a=validate("opportunity",opportunity())
        b=validate("opportunity",opportunity("o2",reach="200"))
        c=validate("opportunity",opportunity("o3",reach_population="existing accounts"))
        r=prioritise([a,b,c])["groups"]
        self.assertEqual(len(r),2)
        self.assertEqual(r["2026-Q4 | new accounts"][0]["rice_score"],"160.00")
        self.assertEqual(r["2026-Q4 | new accounts"][0]["id"],"o2")

    def test_zero_effort_and_invalid_confidence_rejected(self):
        for changes in ({"effort_person_months":"0"},{"confidence_percent":"101"},{"impact":"NaN"}):
            with self.assertRaises(APIError):validate("opportunity",opportunity(**changes))

    def test_release_requires_passed_uat_and_evidence(self):
        release={"id":"r1","story_ids":["s1"],"changelog_ref":"urn:changelog","rollback_ref":"urn:rollback","gtm_ref":"urn:gtm"}
        objects=[{"kind":"story","data":{"id":"s1","status":"done"}}]
        self.assertEqual(release_readiness(release,objects)["status"],"blocked")
        objects.append({"kind":"uat","data":{"id":"test1","story_id":"s1","status":"passed","blocking":True,"evidence_ref":"urn:uat"}})
        self.assertEqual(release_readiness(release,objects)["status"],"ready_for_owner_review")
        objects.append({"kind":"uat","data":{"id":"test2","story_id":"s1","status":"failed","blocking":True}})
        self.assertEqual(release_readiness(release,objects)["status"],"blocked")

    def test_uat_cannot_pass_without_dated_evidence(self):
        with self.assertRaises(APIError):validate("uat",{"id":"u1","title":"Test","story_id":"s1","tester":"tester","status":"passed","blocking":True})

    def test_adoption_rates_and_zero_denominator(self):
        a={"id":"a1","cohort":"new-users","period_start":"2026-09-01","period_end":"2026-09-30","eligible_users":100,"activated_users":60,"retained_users":30,"feature_users":20,"source_ref":"urn:analytics"}
        validate("adoption",a)
        r=product_report([{"kind":"adoption","data":a}],"2026-09-30")["adoption"][0]
        self.assertEqual((r["activation_percent"],r["retention_percent_of_activated"]),("60.00","50.00"))
        a.update(eligible_users=0,activated_users=0,retained_users=0,feature_users=0)
        self.assertIsNone(product_report([{"kind":"adoption","data":a}],"2026-09-30")["adoption"][0]["activation_percent"])

    def test_adoption_inconsistent_cohort_rejected(self):
        with self.assertRaises(APIError):validate("adoption",{"id":"a1","cohort":"new","period_start":"2026-09-01","period_end":"2026-09-30","eligible_users":10,"activated_users":11,"retained_users":2,"feature_users":3,"source_ref":"urn:metrics"})

    def test_sprint_capacity_uses_real_story_estimates(self):
        s={"id":"sp1","title":"Sprint 1","owner":"pm","goal":"Activate users","start_date":"2026-09-01","end_date":"2026-09-14","capacity_points":8,"status":"active"}
        validate("sprint",s)
        r=product_report([{"kind":"sprint","data":s},{"kind":"story","data":{"id":"s1","sprint":"sp1","estimate_points":13,"status":"done"}}],"2026-09-15")
        self.assertTrue(r["sprints"][0]["over_capacity"])
        self.assertEqual(r["sprints"][0]["completed_points"],13)

if __name__=="__main__":unittest.main()
