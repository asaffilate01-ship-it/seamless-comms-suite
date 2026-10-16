/**
 * TraveNexa landlord approval authority. In-memory connector flags are NEVER sufficient.
 * Search/redirects require an active, current, tenant+supplier+product DB approval.
 * All SQL is executed server-side with a trusted private database connection.
 */
import { SUPPLIER_BY_ID, TENANTS } from './catalog.mjs';

const fields = [
  'tenant_key','supplier_key','product_type','status','active',
  'contract_approved','credentials_verified','travel_compliance_approved',
  'payment_approved','servicing_approved','multi_brand_permission',
  'ticketing_approved','payment_mode','merchant_of_record','valid_until',
];
export function supplierApprovalValid(raw,{tenantId,supplierKey,productType,at=Date.now()}={}) {
  if (!raw || typeof raw!=='object' || !TENANTS[tenantId] ||
    !SUPPLIER_BY_ID[supplierKey] ||
    raw.tenant_key!==tenantId || raw.supplier_key!==supplierKey ||
    raw.product_type!==productType || raw.status!=='approved' || raw.active!==true)
    return false;
  const needed=['contract_approved','credentials_verified','travel_compliance_approved',
    'payment_approved','servicing_approved','multi_brand_permission'];
  if (!needed.every(k=>raw[k]===true)) return false;
  if (raw.valid_until!=null) {
    const expiry=raw.valid_until instanceof Date?raw.valid_until.getTime():Date.parse(raw.valid_until);
    if (!Number.isFinite(expiry) || expiry<=at) return false;
  }
  if (!['supplier_checkout','platform_checkout','platform_split'].includes(raw.payment_mode))
    return false;
  if (raw.payment_mode==='supplier_checkout' && raw.merchant_of_record!=='supplier')
    return false;
  if (raw.payment_mode!=='supplier_checkout' &&
      (raw.ticketing_approved!==true ||
       !['travenexa','approved_platform_seller'].includes(raw.merchant_of_record)))
    return false;
  if (productType==='third_party_packages' &&
      (raw.payment_mode!=='supplier_checkout' || raw.merchant_of_record!=='supplier'))
    return false;
  return true;
}
export function canPresentOffer(approval, bookingMode) {
  if (!approval || !['affiliate','supplier_checkout','platform_checkout','platform_split'].includes(bookingMode))
    return false;
  if (bookingMode==='affiliate' || bookingMode==='supplier_checkout')
    return approval.payment_mode==='supplier_checkout' &&
           approval.merchant_of_record==='supplier';
  return approval.payment_mode===bookingMode &&
         approval.ticketing_approved===true &&
         ['travenexa','approved_platform_seller'].includes(approval.merchant_of_record);
}
export function createPostgresSupplierApprovalReader({db}={}) {
  if (!db || typeof db.query!=='function')
    throw new TypeError('trusted_postgres_query_adapter_required');
  const query=db.query.bind(db);
  const list=fields.join(',');
  return async function readApproval({tenantId,supplierKey,productType}) {
    if (!TENANTS[tenantId] || !SUPPLIER_BY_ID[supplierKey] ||
        typeof productType!=='string' ||
        !SUPPLIER_BY_ID[supplierKey].products.includes(productType)) return null;
    const response=await query(
      \`SELECT \${list} FROM public.travenexa_supplier_approvals
         WHERE tenant_key=$1 AND supplier_key=$2 AND product_type=$3
           AND active=true AND status='approved' LIMIT 1\`,
      [tenantId,supplierKey,productType],
    );
    const row=response?.rows?.[0]||null;
    return supplierApprovalValid(row,{tenantId,supplierKey,productType})?row:null;
  };
}
