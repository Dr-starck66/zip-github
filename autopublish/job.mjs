import {slugify} from './engine.mjs';

const voices={
  betgpt:{language:'fr-FR',voice:'expert sport factuel, direct, orienté données et contexte de match'},
  freehotels:{language:'fr-FR',voice:'guide voyage utile, concret, transparent sur prix et disponibilité'},
  pulsoplaneta:{language:'es-ES',voice:'periodismo digital claro, humano, útil y orientado al lector'}
};

export function buildGenerationJob(opportunity,site){
  const mode=opportunity.mode==='PILIER SEO'?'pillar':'reactive';
  const minWords=Number(site.quality?.minWords?.[mode]??(mode==='pillar'?1500:700));
  const maxWords=Number(site.quality?.maxWords?.[mode]??(mode==='pillar'?3000:1200));
  const voice=voices[site.id]||{language:'fr-FR',voice:'journalisme web factuel, clair et utile'};
  const sources=(opportunity.sources||[]).filter(x=>x?.url&&x?.title);
  return {
    version:1,
    state:'NEEDS_CONTENT_GENERATION',
    siteId:site.id,
    destination:{name:site.name,domain:site.domain,adapter:site.adapter,configured:site.configured===true},
    editorial:{
      language:voice.language,
      voice:voice.voice,
      title:opportunity.title,
      slug:opportunity.slug||slugify(opportunity.title),
      angle:opportunity.angle||'Apporter une synthèse factuelle et un angle utile au lecteur.',
      mode:opportunity.mode||'DISCOVER / NEWS RÉACTIF',
      schemaType:opportunity.schemaType||'NewsArticle',
      minWords,maxWords,
      evidence:opportunity.evidence,
      opportunityScore:Number(opportunity.opportunityScore||0),
      discoverSignal:Number(opportunity.discoverSignal||0),
      confirmedDiscover:false
    },
    research:{
      sources,
      requiredChecks:[
        'Identifier au moins une source primaire si elle existe.',
        'Vérifier chaque chiffre, date, score, prix et citation avant publication.',
        'Séparer clairement fait confirmé, déclaration attribuée et incertitude.',
        'Ne jamais inférer une présence Google Discover depuis un concurrent.'
      ]
    },
    articleContract:{
      requiredSections:[
        'chapeau factuel',
        'faits confirmés',
        'données/chiffres clés',
        'conséquences concrètes',
        'contexte utile',
        'incertitudes ou éléments à surveiller',
        'FAQ courte si pertinente',
        'sources et horodatage de mise à jour'
      ],
      seo:[
        'H1 unique et non trompeur',
        'canonical',
        'meta title et description',
        'Article ou NewsArticle JSON-LD',
        'image principale 1200px minimum avec alt descriptif',
        '2 à 4 liens internes pertinents',
        'liens externes vers sources crédibles'
      ],
      forbidden:[
        'copier ou paraphraser de trop près une source',
        'inventer une citation, un chiffre, une source ou une vidéo',
        'bourrage de mots-clés',
        'promettre une présence dans Google News ou Discover',
        'publier si le préflight AUTOPUBLISH échoue'
      ]
    },
    outputContract:{
      type:'astra.article.packet.v1',
      required:['siteId','title','mode','schemaType','evidence','confirmedDiscover','canonical','author','image','sources','originality','bodyHtml'],
      nextEndpoint:'/api/autopublish/preflight'
    }
  };
}
