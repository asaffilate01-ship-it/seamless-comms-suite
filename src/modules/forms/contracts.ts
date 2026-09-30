export type FormFieldType=
  | "text"|"textarea"|"number"|"money"|"date"|"datetime"|"select"|"multiselect"
  | "checkbox"|"radio"|"email"|"phone"|"address"|"file"|"signature"|"entity_ref"|"repeat_group";

export type FormField={
  key:string;labelKey:string;type:FormFieldType;required:boolean;
  helpKey?:string|null;options?:Array<{value:string;labelKey:string}>;
  validation?:Record<string,unknown>;visibility?:Record<string,unknown>;
};

export type FormDefinition={
  id:string;tenantId?:string|null;productKey?:string|null;formKey:string;name:string;
  version:number;status:"draft"|"active"|"retired";localeKeys:string[];
  fields:FormField[];sections:Array<{key:string;titleKey:string;fieldKeys:string[]}>;
  metadata:Record<string,unknown>;
};

export type FormSubmission={
  id:string;tenantId:string;tenantProductId?:string|null;formKey:string;formVersion:number;
  subjectType?:string|null;subjectId?:string|null;status:"draft"|"submitted"|"review"|"accepted"|"rejected";
  answers:Record<string,unknown>;submittedBy?:string|null;submittedAt?:string|null;revision:number;
};

export const FORMS_FEATURES={
  builder:"forms.builder",versions:"forms.versions",conditional:"forms.conditional",
  files:"forms.files",signatures:"forms.signatures",submissions:"forms.submissions",
  review:"forms.review",localisation:"forms.localisation",
} as const;
