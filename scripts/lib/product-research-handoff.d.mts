import type {BuildPack} from './product-research-model.mjs';
export interface ReviewedHandoff {
 version:1;kind:'reviewed-research-handoff';executable:false;
 project:{tenantId:string;projectId:string;revision:number};
 reviewSnapshot:{reviewerId:string;decision:string;reviewedAt:string}[];
 implementation:BuildPack['implementation'];instructions:string[];
}
export function loadReviewedHandoff(client:any,scope:{tenantId:string;projectId:string;revision:number},userId:string):Promise<ReviewedHandoff>;
