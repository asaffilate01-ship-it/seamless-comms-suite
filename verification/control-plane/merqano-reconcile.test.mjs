import test from "node:test";import assert from "node:assert/strict";import { recommendMerqanoReconcile } from "../../src/modules/control-plane/merqano-reconcile";
test("reconcile provisions missing workspace",()=>assert.equal(recommendMerqanoReconcile({productStatus:"requested"}).action,"retry-provision"));
test("reconcile repairs broken binding",()=>assert.equal(recommendMerqanoReconcile({productStatus:"active",externalTenantId:"x",connectionStatus:"failed"}).action,"repair-binding"));
test("healthy Merqano needs no reconciliation",()=>assert.equal(recommendMerqanoReconcile({productStatus:"active",externalTenantId:"x",connectionStatus:"connected",lastVerifiedAt:new Date().toISOString()}).action,"none"));
