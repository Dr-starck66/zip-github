export const POLICIES={
  strict:{id:"strict",name:"Strict Release Gate",pass:82,partial:52,requireEvidence:true,requireCountertest:true,requireRepro:true,maxUrls:5},
  balanced:{id:"balanced",name:"Balanced Reliability",pass:72,partial:42,requireEvidence:true,requireCountertest:false,requireRepro:false,maxUrls:5},
  exploratory:{id:"exploratory",name:"Exploratory Research",pass:66,partial:36,requireEvidence:false,requireCountertest:false,requireRepro:false,maxUrls:3}
};
export function getPolicy(id){return POLICIES[id]||POLICIES.strict}
