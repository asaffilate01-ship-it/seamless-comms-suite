export type AutomationNodeKind="trigger"|"condition"|"ai_decision"|"action"|"delay"|"branch"|"approval"|"outcome";

export type AutomationNode={
  id:string;kind:AutomationNodeKind;name:string;
  moduleKey?:string|null;actionKey?:string|null;config:Record<string,unknown>;
};

export type AutomationDefinition={
  id:string;tenantId:string;tenantProductId?:string|null;name:string;
  description?:string|null;triggerEvent:string;status:"draft"|"active"|"paused"|"archived";
  version:number;nodes:AutomationNode[];
  edges:Array<{from:string;to:string;condition?:string|null}>;
};

export type AutomationRun={
  id:string;tenantId:string;workflowId:string;workflowVersion:number;
  eventId?:string|null;status:"queued"|"running"|"waiting"|"approval"|"completed"|"failed"|"cancelled";
  currentNodeId?:string|null;startedAt?:string|null;completedAt?:string|null;
  context:Record<string,unknown>;
};

export type AutomationActionDescriptor={
  key:string;moduleKey:string;description:string;
  risk:"read"|"low"|"medium"|"high";requiresApproval:boolean;
  inputSchemaRef:string;
};

export const AUTOMATION_FEATURES={
  builder:"automation.builder",eventTriggers:"automation.event_triggers",conditions:"automation.conditions",
  aiDecisions:"automation.ai_decisions",actions:"automation.actions",delays:"automation.delays",
  approvals:"automation.approvals",schedules:"automation.schedules",runs:"automation.runs",
} as const;

export const AUTOMATION_EVENT_TYPES={
  runStarted:"automation.run.started",actionQueued:"automation.action.queued",
  approvalRequested:"automation.approval.requested",runCompleted:"automation.run.completed",
  runFailed:"automation.run.failed",
} as const;
