export const journeySteps=[
{title:'Understand the goal',template:'intake',prompt:'Clarify the requested outcome, constraints and missing information. Produce an editable brief and precise questions. Do not assume missing facts.'},
{title:'Gather the evidence',template:'documents',prompt:'Check the supplied brief and evidence. Identify missing documents, permissions or data. Prepare specific collection tasks and record what is actually available.'},
{title:'Analyse the situation',template:'projects',prompt:'Analyse the permitted evidence and completed prior stages. Explain findings, uncertainties and options. Use supplied numeric results as authoritative; never invent figures.'},
{title:'Prepare the action plan',template:'coordination',prompt:'Prepare a practical sequence of actions with responsible roles and dependencies. Identify steps needing customer or professional decisions. Only propose supported internal tasks and drafts.'},
{title:'Coordinate execution',template:'coordination',prompt:'Review the accepted plan and the recorded outcomes of prior stages. Prepare remaining internal tasks and communication drafts. External execution must be completed through a connected adapter or by the responsible person.'},
{title:'Verify the outcome',template:'evidence',prompt:'Check the supplied completion evidence against the original goal. Identify unmet requirements and needed professional sign-off. Do not claim success from a task status alone.'},
{title:'Handover and follow-up',template:'documents',prompt:'Prepare a handover summary with the original goal, completed outcomes, evidence references and outstanding responsibilities. Propose any required follow-up tasks. State all remaining limitations clearly.'}
] as const;
