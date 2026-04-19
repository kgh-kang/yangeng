// ================================================================
//  양박사님 체계 영문 구문 분석 엔진 (개선판)
//  핵심 방법론:
//    1. 동사를 먼저 찾는다
//    2. 동사 전후의 명사를 찾는다 (앞=주어, 뒤=목적어/보어)
//    3. 동사 뒤 명사 개수 + 이퀄 관계로 형식 판별
//  용어: 주어보어(SC), 목적어보어(OC), 주동(S+V)
//  관사 = 형용사, 전치사구 = 98% 부사구 (of는 형용사구)
// ================================================================

const BE=new Set('am is are was were be been being'.split(' '));
const LINKING=new Set([...BE,...'seem seems seemed appear appears appeared become becomes became remain remains remained stay stays stayed look looks looked sound sounds sounded feel feels felt taste tastes tasted smell smells smelled smelt grow grows grew grown turn turns turned get gets got gotten go goes went gone prove proves proved proven keep keeps kept fall falls fell fallen come comes came'.split(' ')]);
const PURE_LINKING=new Set([...BE,...'seem seems seemed become becomes became remain remains remained'.split(' ')]);
const DITRANSITIVE=new Set('give gives gave given send sends sent tell tells told show shows showed shown teach teaches taught buy buys bought bring brings brought offer offers offered lend lends lent write writes wrote written hand hands handed pass passes passed pay pays paid promise promises promised read reads throw throws threw thrown wish wishes wished ask asks asked award awards awarded grant grants granted owe owes owed leave leaves left make makes made cook cooks cooked get gets got sing sings sang sung save saves saved find finds found fetch fetches fetched deny denies denied charge charges charged cost costs'.split(' '));
const OC_CONSIDER=new Set('call calls called name names named make makes made find finds found keep keeps kept leave leaves left consider considers considered think thinks thought believe believes believed elect elects elected appoint appoints appointed declare declares declared prove proves proved proven render renders rendered drive drives drove driven turn turns turned paint paints painted dye dyes dyed color colors colored crown crowns crowned label labels labeled'.split(' '));
const CAUSATIVE=new Set('make makes made let lets have has had'.split(' '));
const PERCEPTION=new Set('see sees saw seen watch watches watched hear hears heard feel feels felt smell smells smelled smelt notice notices noticed observe observes observed'.split(' '));
const INDUCTIVE=new Set('help helps helped get gets got gotten'.split(' '));
const OC_GENERAL=new Set('tell tells told ask asks asked want wants wanted expect expects expected advise advises advised allow allows allowed cause causes caused enable enables enabled encourage encourages encouraged force forces forced invite invites invited order orders ordered permit permits permitted persuade persuades persuaded remind reminds reminded require requires required urge urges urged warn warns warned forbid forbids forbade forbidden need needs needed'.split(' '));
const AUX=new Set('do does did have has had will would shall should can could may might must need dare ought'.split(' '));
const PREP=new Set('in on at to for with by from of about into through during before after above below between under over up down out off near around against along across behind beside beyond among upon within without toward towards until since except like unlike despite throughout'.split(' '));
const ART=new Set(['a','an','the']);
const CONJ=new Set(['and','or','nor','but','yet']);
const PRO_S=new Set('i you he she it we they who what which that one there'.split(' '));
const PRO_O=new Set('me you him her it us them whom myself yourself himself herself itself ourselves themselves'.split(' '));
const DEMO=new Set(['this','that','these','those']);
const ADV_SET=new Set('very so too really quite rather pretty extremely always never often sometimes usually already still just also even only here there now then today yesterday tomorrow soon early late fast slowly quickly well badly hard easily carefully certainly probably perhaps maybe definitely surely clearly simply together alone again almost enough ever far however instead long much nearly not once away back how when where why up down out off continuously earnestly thoroughly simultaneously instantly constantly merely finally suddenly recently frequently immediately eventually apparently obviously necessarily gradually literally naturally certainly actually generally especially particularly recently basically essentially merely primarily specifically'.split(' '));
const ADJ_SET=new Set('good bad great big small large little old new young long short high low hot cold warm cool fast slow happy sad angry beautiful ugly nice fine open closed rich poor strong weak hard soft easy difficult important simple complex full empty clean dirty dark light bright deep wide narrow thick thin flat round sharp smooth quiet loud safe dangerous free busy ready sorry sure true false real possible impossible necessary available famous popular serious terrible wonderful amazing excellent perfect brilliant fantastic gorgeous handsome lovely pretty ambitious afraid alive alone asleep awake aware glad proud brave calm clever cruel curious dear eager fair faithful familiar fierce fond foolish gentle grateful guilty humble innocent jealous keen kind lazy loyal modest nervous patient polite rare rude selfish shy silly sincere stupid suspicious tall tiny tough vast violent visible wise worthy diligent special precise accurate electronic sophisticated similar conventional whole entire complete mere main chief own right wrong next last certain such due own previous different various other another several many few much little enough own blue red green yellow black white golden entire proper whole responsible effective efficient pleasant creative productive comfortable foreign domestic urban rural medical legal financial technical digital modern ancient recent'.split(' '));
const INTRANS_ONLY=new Set('rise rises rose risen arrive arrives arrived die dies died exist exists existed happen happens happened shine shines shone rain rains rained wander wanders wandered sleep sleeps slept laugh laughs laughed cry cries cried smile smiles smiled walk walks walked run runs ran sit sits sat stand stands stood swim swims swam lie lies lay lain live lives lived work works worked travel travels traveled wait waits waited fall falls fell fallen emerge emerges emerged disappear disappears disappeared occur occurs occurred proceed proceeds proceeded function functions functioned breathe breathes breathed sneeze sneezes sneezed cough coughs coughed yawn yawns yawned sigh sighs sighed tremble trembles trembled shiver shivers shivered jump jumps jumped kneel kneels knelt bark barks barked relax relaxes relaxed'.split(' '));

// 자타 겸용 동사 (자동사/타동사 모두 가능) — TRANSITIVE에 추가
const AMBI_VERBS=new Set('dance dances danced sing sings sang sung fly flies flew flown climb climbs climbed scream screams screamed shout shouts shouted whisper whispers whispered move moves moved change changes changed grow grows grew grown stop stops stopped continue continues continued'.split(' '));

// 일반 타동사 (3형식 전용) — 확장
const TRANSITIVE=new Set('eat eats ate eaten drink drinks drank drunk play plays played read reads write writes wrote written study studies studied learn learns learned learnt use uses used open opens opened close closes closed start starts started stop stops stopped begin begins began begun finish finishes finished enjoy enjoys enjoyed love loves loved like likes liked hate hates hated need needs needed want wants wanted take takes took taken carry carries carried hold holds held catch catches caught hit hits break breaks broke broken build builds built cut cuts create creates created destroy destroys destroyed develop develops developed discuss discusses discussed explain explains explained improve improves improved include includes included involve involves involved meet meets met produce produces produced provide provides provided receive receives received remember remembers remembered serve serves served speak speaks spoke spoken spend spends spent support supports supported understand understands understood visit visits visited accept accepts accepted achieve achieves achieved choose chooses chose chosen describe describes described establish establishes established examine examines examined follow follows followed mention mentions mentioned obtain obtains obtained prepare prepares prepared raise raises raised suggest suggests suggested complete completes completed contain contains contained express expresses expressed manage manages managed represent represents represented solve solves solved review reviews reviewed analyze analyzes analyzed check checks checked test tests tested fix fixes fixed handle handles handled replace replaces replaced remove removes removed add adds added update updates updated submit submits submitted cancel cancels canceled confirm confirms confirmed share shares shared upload uploads uploaded download downloads downloaded install installs installed delete deletes deleted edit edits edited publish publishes published release releases released launch launches launched consider considers considered avoid avoids avoided attempt attempts attempted continue continues continued decide decides decided determine determines determined discover discovers discovered enjoy enjoys enjoyed expand expands expanded explore explores explored generate generates generated identify identifies identified indicate indicates indicated maintain maintains maintained observe observes observed perform performs performed prevent prevents prevented protect protects protected reduce reduces reduced report reports reported require requires required'.split(' '));

const lo=w=>w.toLowerCase();

// ================================================================
// compromise.js NLP 폴백 (기존 DB에서 판별 불가 시 사용)
// ================================================================
const hasNLP = typeof nlp !== 'undefined';
const _posCache = new Map();

function getNlpTags(w) {
    if (_posCache.has(w)) return _posCache.get(w);
    if (!hasNLP) { _posCache.set(w, null); return null; }
    try {
        const doc = nlp(w);
        const terms = doc.json();
        let tags = new Set();
        if (terms.length > 0 && terms[0].terms && terms[0].terms.length > 0) {
            terms[0].terms[0].tags.forEach(t => tags.add(t));
        }
        _posCache.set(w, tags);
        return tags;
    } catch(e) {
        _posCache.set(w, null);
        return null;
    }
}

function isAdj(w){
    const l=lo(w);
    if(ART.has(l)) return true; // 관사 = 형용사 (양박사님)
    if(ADJ_SET.has(l)) return true;
    if(/(?:ful|less|ous|ive|ible|able|ent|ant|ical|ish)$/i.test(w)) return true;
    // NLP 폴백
    const tags=getNlpTags(l);
    if(tags && tags.has('Adjective') && !tags.has('Verb')) return true;
    return false;
}

function isAdv(w){
    const l=lo(w);
    if(ADV_SET.has(l)) return true;
    if(/ly$/i.test(w)&&!ADJ_SET.has(l)&&l!=='lovely'&&l!=='lonely'&&l!=='friendly'&&l!=='early') return true;
    // NLP 폴백
    const tags=getNlpTags(l);
    if(tags && tags.has('Adverb') && !tags.has('Verb') && !tags.has('Adjective')) return true;
    return false;
}

function isNoun(w){
    const l=lo(w);
    if(PRO_S.has(l)||PRO_O.has(l)||DEMO.has(l)) return true;
    if(ART.has(l)||isAdj(w)||isAdv(w)||CONJ.has(l)) return false;
    if(AUX.has(l)||BE.has(l)||PREP.has(l)) return false;
    // 동사 전용이 아닌 단어는 명사일 가능성
    if(!isVerbOnly(w)) return true;
    // NLP 폴백
    const tags=getNlpTags(l);
    if(tags && tags.has('Noun')) return true;
    return false;
}

function isVerbOnly(w){
    const l=lo(w);
    // 확실한 동사만 (명사로도 쓰이는 것 제외)
    if(BE.has(l)||AUX.has(l)) return true;
    if(INTRANS_ONLY.has(l)) return true;
    return false;
}

function isVInDB(l){
    return BE.has(l)||AUX.has(l)||LINKING.has(l)||DITRANSITIVE.has(l)||OC_CONSIDER.has(l)||CAUSATIVE.has(l)||PERCEPTION.has(l)||INDUCTIVE.has(l)||OC_GENERAL.has(l)||INTRANS_ONLY.has(l)||TRANSITIVE.has(l)||AMBI_VERBS.has(l);
}

function isV(w){
    const l=lo(w);
    if(isVInDB(l)) return true;
    // 동사 어미 패턴: ~ed(과거), ~es(3인칭)
    if(/(?:ed|es)$/i.test(w)) return true;
    // ~s로 끝나는 단어: 원형이 동사 DB에 있으면 동사
    if(/[^s]s$/i.test(w)){
        const base=l.slice(0,-1);
        if(isVInDB(base)) return true;
    }
    // ~ing로 끝나는 단어: 원형이 동사 DB에 있으면 동사
    if(/ing$/i.test(w)){
        let base=l.replace(/ing$/,'');
        if(isVInDB(base)) return true;
        // 자음 겹침 복원: running → run
        if(base.length>=3&&base[base.length-1]===base[base.length-2]){
            if(isVInDB(base.slice(0,-1))) return true;
        }
        // ~e 복원: making �� make
        if(isVInDB(base+'e')) return true;
    }
    // NLP 폴백: 기존 DB에서 판별 불가 시 compromise.js로 확인
    const tags=getNlpTags(l);
    if(tags && tags.has('Verb')) return true;
    return false;
}

function tok(s){return s.replace(/[!?.]+$/,'').replace(/,/g,' ').trim().split(/\s+/).filter(w=>w);}

// ================================================================
// 이퀄 관계 판별 (양박사님 핵심)
// S = C 이면 2형식, S ≠ O 이면 3형식
// "She made a good wife" → she = wife → 2형식
// "She made a good meal" → she ≠ meal → 3형식
// ================================================================

// 사람/생물 명사 집합 (이퀄 판별 보조)
const PERSON_NOUNS=new Set('person man woman boy girl child children kid baby student teacher doctor nurse lawyer engineer professor scientist worker manager director president king queen prince princess wife husband father mother brother sister son daughter friend partner leader hero captain soldier officer agent driver cook chef pilot singer dancer writer artist player athlete champion member captain gentleman lady boss servant saint villain fool genius master'.split(' '));
const NON_PERSON_NOUNS=new Set('thing object item food meal cake pie bread water coffee tea house home room door window car bus train plane ship boat book pen paper desk table chair bed wall floor road street city town country park garden tree flower river mountain sea ocean sky sun moon star rain snow wind fire air money time day night week month year game song music movie film picture photo story news idea problem question answer plan job work project result effect change effort difference mistake issue point case fact reason way system part group world life place state case end example point area order number level period course type line name form hand house state head side'.split(' '));

function isPersonLike(word){
    const l=lo(word);
    if(PRO_S.has(l)||PRO_O.has(l)) return true;
    if(PERSON_NOUNS.has(l)) return true;
    // ~er, ~or 접미사는 사람일 가능성 높음
    if(/(?:er|or|ist|ess|ant|ent)$/i.test(word)&&!NON_PERSON_NOUNS.has(l)) return true;
    return false;
}

function isEqualRelation(subHead, npWords){
    // 주어의 head와 보어 후보의 head가 "같은 종류"인지 판별
    const np = splitNP(npWords);
    const compHead = lo(np.head);
    const subH = lo(subHead);

    // 같은 단어면 당연히 이퀄
    if(subH===compHead) return true;

    // 둘 다 사람류이면 이퀄 (She = wife, He = doctor 등)
    if(isPersonLike(subHead)&&isPersonLike(np.head)) return true;

    // 주어가 사람이고 보어가 비인칭 사물이면 이퀄 아님
    if(isPersonLike(subHead)&&NON_PERSON_NOUNS.has(compHead)) return false;

    // 주어가 대명사이고 보어가 사람명사면 이퀄
    if((PRO_S.has(subH)||PRO_O.has(subH))&&PERSON_NOUNS.has(compHead)) return true;

    // 기본: 판별 불가시 false (3형식으로 처리)
    return false;
}

// 명사구 분리: head + mods
// N+N 구조 인식: "engineering English" → head=English, mods=[engineering]
// 전치사구 포함: "The roof of the house" → head=roof, mods=[The, of the house]
function splitNP(words){
    if(!words.length) return {head:'',mods:[]};
    if(words.length===1) return {head:words[0],mods:[]};

    // 전치사구를 먼저 분리
    let mainWords=[], prepMods=[];
    let i=0;
    while(i<words.length){
        if(PREP.has(lo(words[i]))){
            // 전치사구 시작 → 끝까지 수집
            let pp=[words[i]];i++;
            while(i<words.length&&!PREP.has(lo(words[i]))){pp.push(words[i]);i++;}
            prepMods.push(pp.join(' '));
            continue;
        }
        mainWords.push(words[i]);i++;
    }

    if(!mainWords.length){
        // 전치사구만 있는 경우
        return {head:words[words.length-1],mods:[...words.slice(0,-1)]};
    }

    let headIdx=mainWords.length-1;
    for(let j=mainWords.length-1;j>=0;j--){
        const l=lo(mainWords[j]);
        if(!ART.has(l)&&!isAdj(mainWords[j])&&!isAdv(mainWords[j])&&!CONJ.has(l)){
            headIdx=j;break;
        }
    }
    const head=mainWords[headIdx];
    const mods=[];

    // head 앞뒤의 수식어 (N+N 구조 포함)
    for(let j=0;j<mainWords.length;j++){
        if(j===headIdx) continue;
        mods.push(mainWords[j]);
    }
    // 전치사구는 형용사구로 수식어에 추가 (of 등)
    mods.push(...prepMods);

    return {head,mods};
}

// 명사 그룹 개수 세기 (4형식: 2그룹, 5형식: 2그룹, 3형식: 1그룹)
// 관사(a/the)가 새 그룹을 시작
function countNounGroups(words){
    let groups=0, inGroup=false;
    for(const w of words){
        const l=lo(w);
        if(ART.has(l)){
            // 관사 = 새 그룹 시작
            if(inGroup) groups++;
            inGroup=true;
        } else if(PRO_O.has(l)||PRO_S.has(l)){
            if(inGroup) groups++;
            groups++;
            inGroup=false;
        } else if(!isAdj(w)&&!isAdv(w)&&!CONJ.has(l)){
            // 명사
            if(!inGroup){inGroup=true;}
        }
    }
    if(inGroup) groups++;
    return groups;
}

// 2형식 형용사보어 판별
function isAdjComp(words){
    return words.every(w=>isAdj(w)||isAdv(w)||CONJ.has(lo(w))||ART.has(lo(w)));
}

// ================================================================
// 조동사 체인 파서 — "will have been doing" 등 정확 처리
// ================================================================
function parseAuxChain(words, lw, startIdx){
    let auxParts=[], idx=startIdx;
    let foundBe=false;

    // 조동사 수집: AUX → AUX → ... (not 포함)
    while(idx<words.length){
        if(AUX.has(lw[idx])){
            auxParts.push(words[idx]);
            if(lw[idx]==='have'||lw[idx]==='has'||lw[idx]==='had') {
                // have/has/had 다음에 been이 올 수 있음
            }
            idx++;
            if(idx<words.length&&lw[idx]==='not'){auxParts.push(words[idx]);idx++;}
        } else if(BE.has(lw[idx])){
            auxParts.push(words[idx]);
            if(lw[idx]==='been'||lw[idx]==='being') foundBe=true;
            else foundBe=true;
            idx++;
            if(idx<words.length&&lw[idx]==='not'){auxParts.push(words[idx]);idx++;}
        } else {
            break;
        }
    }

    // 진행형 판별: be(조동사) + ~ing → 하나의 동사구
    let mainVerb=null, ingMod=null;
    if(idx<words.length){
        const w=words[idx], l=lw[idx];
        if(foundBe && w.endsWith('ing') && isV(w)){
            // be + ~ing = 진행형 → 메인동사에 포함
            auxParts.push(w);
            mainVerb=auxParts.join(' ');
            idx++;
            return {verb:mainVerb, nextIdx:idx, ingMod:null};
        }
        if(w.endsWith('ing') && isV(w) && auxParts.length>0 &&
           BE.has(lo(auxParts[auxParts.length-1].replace(/\s+not$/,'')))){
            // 마지막 aux가 be 계열이면 진행형
            auxParts.push(w);
            mainVerb=auxParts.join(' ');
            idx++;
            return {verb:mainVerb, nextIdx:idx, ingMod:null};
        }
        // been + pp(~ed) = 수동태
        if(foundBe && (w.endsWith('ed')||isV(w))){
            auxParts.push(w);
            mainVerb=auxParts.join(' ');
            idx++;
            return {verb:mainVerb, nextIdx:idx, ingMod:null};
        }
        // 일반 본동사
        auxParts.push(w);
        mainVerb=auxParts.join(' ');
        idx++;
    } else {
        mainVerb=auxParts.join(' ');
    }

    return {verb:mainVerb||'', nextIdx:idx, ingMod:null};
}

// ================================================================
// 전치사구 분류 (양박사님)
// of → 형용사구 (명사 수식), 나머지 → 부사구
// ================================================================
function classifyPrepPhrase(pp){
    const first=pp.split(/\s+/)[0];
    if(lo(first)==='of') return 'adj'; // 형용사구
    return 'adv'; // 부사구 (98%)
}

// 메인 파서
// ================================================================
// 복문/중문 분리 (교수님: "복문이면 문장 2개, 동사 2개, 형식 2개")
// 등위접속사(and, or, but, yet, so)로 연결된 중문을 분리
// 세미콜론(;)으로 분리된 문장도 처리
// ================================================================
function splitSentences(sentence){
    const orig=sentence.trim();
    // 1. 세미콜론으로 분리
    if(orig.includes(';')){
        const parts=orig.split(';').map(s=>s.trim()).filter(s=>s);
        const conjunctions=parts.slice(1).map(()=>';');
        return {parts, conjunctions};
    }
    // 2. 등위접속사로 연결된 중문 분리
    const words=tok(orig);
    const lw=words.map(lo);
    const splits=[];
    const conjunctions=[];
    let lastSplit=0;

    for(let i=1;i<words.length-1;i++){
        if(!CONJ.has(lw[i])) continue;
        const afterIdx=i+1;
        if(afterIdx>=words.length) continue;
        const al=lw[afterIdx];

        let isNewSentence=false;

        if(PRO_S.has(al)&&afterIdx+1<words.length&&(isV(words[afterIdx+1])||AUX.has(lw[afterIdx+1])||BE.has(lw[afterIdx+1]))){
            isNewSentence=true;
        }
        if(!PRO_S.has(al)&&!ART.has(al)&&!DEMO.has(al)&&(BE.has(al)||isV(words[afterIdx]))){
            let hasPriorVerb=false;
            for(let j=lastSplit;j<i;j++){
                if(isV(words[j])||AUX.has(lw[j])||BE.has(lw[j])){hasPriorVerb=true;break;}
            }
            if(hasPriorVerb) isNewSentence=true;
        }
        if(al==='there'&&afterIdx+1<words.length&&BE.has(lw[afterIdx+1])){
            isNewSentence=true;
        }

        if(isNewSentence){
            splits.push(words.slice(lastSplit,i).join(' '));
            conjunctions.push(words[i]);
            lastSplit=afterIdx;
        }
    }
    splits.push(words.slice(lastSplit).join(' '));

    const parts=splits.filter(s=>s.trim()).map(s=>s.trim());
    return {parts, conjunctions};
}

// 복수 문장 파서 — 분리 후 각각 분석
function parseMulti(sentence){
    const {parts, conjunctions}=splitSentences(sentence);
    if(parts.length<=1) return {results:[parse(sentence)].filter(Boolean), conjunctions:[]};
    return {results:parts.map(s=>parse(s)).filter(Boolean), conjunctions};
}

// 단문 파서
function parse(sentence){
    const orig=sentence.trim();
    const words=tok(orig);
    if(!words.length) return null;
    const lw=words.map(lo);

    let R={
        orig, sub:{head:'',mods:[]}, verb:'', comp:{head:'',mods:[]},
        obj:{head:'',mods:[]}, io:{head:'',mods:[]}, oc:{head:'',mods:[]},
        modV:[], toInf:null,
        type:'',typeKo:'',verbStyle:'',sentType:'평서문',verbSub:'',
        warnings:[]
    };

    // there is/are → 1형식
    if(lw[0]==='there'&&words.length>=3&&BE.has(lw[1])){
        R.verb=words[1]; R.modV.push('there');
        let rest=words.slice(2); let np=splitNP(rest);
        R.sub=np;
        R.type='1형식';R.typeKo='자존형';R.verbStyle="'있다'";
        return R;
    }

    // 명령문
    if(isImp(words,lw,orig)){
        R.sentType='명령문';
        R.sub={head:'(You)',mods:[]};
        let si=0; if(lw[0]==='please'){R.modV.push('please');si=1;}
        // 주어 누락 의심: 조동사(have/has/had/do/does/did/will/would 등)로 시작하면 경고
        const f=lw[si];
        if(AUX.has(f)&&f!=='do'&&f!=="don't"&&f!=='let'){
            R.warnings.push('주어가 누락된 것 같습니다. 명령문이 아니라면 주어(I, He, She 등)를 추가해 보세요.');
        }
        parsePred(words,lw,si,R);
        detType(R); return R;
    }

    // 의문문
    if(orig.endsWith('?')){
        R.sentType='의문문';
        parseQ(words,lw,R);
        detType(R); return R;
    }

    // 평서문
    parseDecl(words,lw,R);
    detType(R); return R;
}

function isImp(w,lw,orig){
    if(!w.length)return false;
    if(orig.trim().endsWith('?'))return false;
    const f=lw[0];
    if(f==='please'||f==='let'||f==="let's")return true;
    if(!PRO_S.has(f)&&!ART.has(f)&&!DEMO.has(f)){
        if(BE.has(f)||isV(w[0])){if(!w[0].endsWith('ing')||BE.has(f))return true;}
    }
    if(orig.includes(',')&&orig.endsWith('!')){
        const after=orig.split(',').pop().trim().replace(/!$/,'').trim().split(/\s+/);
        if(after.length&&(BE.has(after[0].toLowerCase())||isV(after[0])))return true;
    }
    return false;
}

function parseQ(words,lw,R){
    const WH=new Set(['how','what','who','whom','where','when','why','which','whose']);
    if(WH.has(lw[0])){
        let wh=words[0], auxI=-1;
        for(let i=1;i<words.length;i++){if(AUX.has(lw[i])||BE.has(lw[i])){auxI=i;break;}}
        if(auxI<0){R.sub={head:wh,mods:[]};parsePred(words,lw,1,R);return;}
        let whPhrase=words.slice(0,auxI).join(' ');
        let si=auxI+1,se=si;
        if(si<words.length&&PRO_S.has(lw[si]))se=si+1;
        else{while(se<words.length&&!isV(words[se])&&!isAdj(words[se])&&!PREP.has(lw[se]))se++;}
        let subW=words.slice(si,se);
        R.sub=splitNP(subW.length?subW:['(someone)']);

        if(BE.has(lw[auxI])){
            if(se<words.length&&words[se].endsWith('ing')&&isV(words[se])){
                // be + ~ing → 진행형
                R.verb=words[auxI]+' '+words[se];
                parseRem(words,lw,se+1,R);
            } else { R.verb=words[auxI]; parseRem(words,lw,se,R); }
        } else {
            if(se<words.length&&isV(words[se])){
                R.verb=words[se]; R.modV.push(words[auxI]); parseRem(words,lw,se+1,R);
            } else { R.verb=words[auxI]; parseRem(words,lw,se,R); }
        }

        if(['how','where','when','why'].includes(lw[0])) R.modV.unshift(whPhrase);
        else {
            if(!R.obj.head&&!R.comp.head){
                if(LINKING.has(lo(R.verb.split(' ')[0]))) R.comp={head:whPhrase,mods:[]};
                else R.obj={head:whPhrase,mods:[]};
            }
        }
        return;
    }

    // Yes/No question
    if(AUX.has(lw[0])||BE.has(lw[0])){
        let aux=words[0], si=1, se=1;
        if(si<words.length&&PRO_S.has(lw[si]))se=si+1;
        else {
            se=si;
            while(se<words.length){
                const w=lw[se];
                if(se>si && (isAdj(words[se])||isV(words[se])) && !ART.has(w)) break;
                se++;
            }
        }
        let subW=words.slice(si,se);
        R.sub=splitNP(subW);

        if(BE.has(lw[0])){
            R.verb=aux; parseRem(words,lw,se,R);
        } else {
            if(se<words.length&&isV(words[se])){
                R.verb=words[se]; R.modV.push(aux); parseRem(words,lw,se+1,R);
            } else { R.verb=aux; parseRem(words,lw,se,R); }
        }
        return;
    }
    parseDecl(words,lw,R);
}

function parseDecl(words,lw,R){
    let vi=-1;
    // 전략: 확실한 동사(AUX, BE, 동사DB)를 먼저 찾되,
    //        전치사구 내부는 스킵한다.
    //        전치사구가 끝나면(명사 뒤) 다시 동사를 찾는다.
    let inPrep=false;
    let prepDepth=0; // 전치사 후 명사를 만나면 전치사구 끝

    for(let i=0;i<words.length;i++){
        if(i===0&&PRO_S.has(lw[i])){R.sub={head:words[0],mods:[]};vi=1;break;}
        if(i===0&&DEMO.has(lw[i])&&words.length>1&&(isV(words[1])||AUX.has(lw[1])||BE.has(lw[1]))){
            R.sub={head:words[0],mods:[]};vi=1;break;
        }
        if(i>0){
            // 전치사를 만나면 전치사구 시작
            if(PREP.has(lw[i])&&!inPrep){
                inPrep=true; prepDepth=0; continue;
            }
            // 전치사구 내부
            if(inPrep){
                if(ART.has(lw[i])||isAdj(words[i])){continue;} // 관사/형용사 스킵
                if(AUX.has(lw[i])||BE.has(lw[i])){
                    inPrep=false;
                    R.sub=splitNP(words.slice(0,i));vi=i;break;
                }
                // 명사(전치사의 목적어)를 만나면 전치사구 완료 대기
                prepDepth++;
                if(prepDepth>=1){
                    // 다음 단어를 확인 — 동사면 전치사구 끝
                    if(i+1<words.length){
                        const nextL=lw[i+1];
                        if(AUX.has(nextL)||BE.has(nextL)||
                           (isV(words[i+1])&&!isAdj(words[i+1])&&!ART.has(nextL)&&!PREP.has(nextL))){
                            inPrep=false;
                            // 다음 단어가 동사
                            R.sub=splitNP(words.slice(0,i+1));vi=i+1;break;
                        }
                        // 다음 단어가 전치사면 새 전치사구
                        if(PREP.has(nextL)){inPrep=false;} // 다음 반복에서 다시 시작
                    }
                }
                continue;
            }

            if(AUX.has(lw[i])||BE.has(lw[i])){
                R.sub=splitNP(words.slice(0,i));vi=i;break;
            }
            // 관사/형용사 다음의 단어는 명사일 가능성 높음 → 동사로 판단하지 않음
            const prevIsArt = i>0 && (ART.has(lw[i-1])||isAdj(words[i-1]));
            if(isV(words[i])&&!isAdj(words[i])&&!prevIsArt){
                R.sub=splitNP(words.slice(0,i));vi=i;break;
            }
            if(isV(words[i])&&isAdj(words[i])){
                if(i+1<words.length&&!isV(words[i+1]))continue;
                R.sub=splitNP(words.slice(0,i));vi=i;break;
            }
            // 관사 뒤 단어인데 동사DB에도 있는 경우: 뒤에 확실한 동사가 있으면 명사로 취급
            if(prevIsArt&&isV(words[i])){
                // 계속 스캔 — 뒤에서 진짜 동사를 찾을 것
                continue;
            }
        }
    }
    if(vi<0){
        // 폴백: 마지막 단어가 동사일 가능성 체크 (3인칭 ~s 등)
        for(let i=words.length-1;i>0;i--){
            if(!PREP.has(lw[i])&&!ART.has(lw[i])&&!isAdj(words[i])&&!isAdv(words[i])){
                // 동사 후보: ~s, ~ed 어미로 끝나는 단어
                if(/(?:ed|es|[^s]s)$/i.test(words[i])&&!PRO_S.has(lw[i])&&!PRO_O.has(lw[i])){
                    R.sub=splitNP(words.slice(0,i));vi=i;break;
                }
            }
        }
    }
    if(vi<0){
        if(words.length>=2){R.sub={head:words[0],mods:[]};vi=1;}
        else{R.sub={head:words[0],mods:[]};R.verb='';R.type='—';return;}
    }
    parsePred(words,lw,vi,R);
}

function parsePred(words,lw,vi,R){
    if(vi>=words.length){R.verb='(?)';return;}

    // 조동사 체인 파싱 (개선: will have been doing 등)
    let idx=vi;
    let parts=[];
    let hasBe=false;

    // 조동사 수집
    while(idx<words.length&&(AUX.has(lw[idx])||BE.has(lw[idx]))){
        if(BE.has(lw[idx])) hasBe=true;
        parts.push(words[idx]);idx++;
        if(idx<words.length&&lw[idx]==='not'){parts.push(words[idx]);idx++;}
        // been도 be 계열
        if(idx<words.length&&lw[idx]==='been'){hasBe=true;parts.push(words[idx]);idx++;}
    }

    // 본동사 처리 — 부사가 조동사와 본동사 사이에 올 수 있음 (have earnestly asked)
    // 부사를 건너뛰고 본동사를 찾음
    let skippedAdv=[];
    if(idx<words.length&&parts.length>0&&isAdv(words[idx])){
        // 조동사 뒤 부사 스킵
        while(idx<words.length&&isAdv(words[idx])){
            skippedAdv.push(words[idx]);idx++;
        }
    }

    if(idx<words.length){
        // be + ~ing = 진행형 → 동사구에 포함
        if(hasBe&&words[idx].endsWith('ing')&&isV(words[idx])){
            parts.push(words[idx]);idx++;
            R.verb=parts.join(' ');
        }
        // be + ~ed/pp = 수동태
        else if(hasBe&&parts.length>0&&words[idx].endsWith('ed')&&isV(words[idx])&&!isAdj(words[idx])){
            parts.push(words[idx]);idx++;
            R.verb=parts.join(' ');
        }
        // 이미 AUX/BE가 있으면 다음 단어가 동사일 때만 추가
        else if(parts.length>0&&(hasBe||parts.some(p=>AUX.has(lo(p))))){
            if(isV(words[idx])&&!isAdj(words[idx])&&!ART.has(lw[idx])&&!PREP.has(lw[idx])){
                parts.push(words[idx]);idx++;
            }
            R.verb=parts.join(' ');
        }
        else {
            // 조동사가 없었으면 이 단어가 본동사
            parts.push(words[idx]);idx++;
            R.verb=parts.join(' ');
        }
    } else {
        R.verb=parts.join(' ');
    }

    // 스킵한 부사를 동사 수식어로 추가
    if(skippedAdv.length) R.modV.push(...skippedAdv);

    parseRem(words,lw,idx,R);
}

function parseRem(words,lw,si,R){
    if(si>=words.length)return;
    const vParts=R.verb.split(' ');
    const vb=lo(vParts[vParts.length-1]);
    // 진행형에서는 ~ing 제거하고 원형으로 동사 분류 체크
    let vbBase=vb;
    if(vb.endsWith('ing')){
        vbBase=vb.replace(/ing$/,'');
        if(vbBase.length>=3&&vbBase[vbBase.length-1]===vbBase[vbBase.length-2]) vbBase=vbBase.slice(0,-1);
    }

    const isLnk=LINKING.has(vb)||LINKING.has(vbBase);
    const isPure=PURE_LINKING.has(vb)||PURE_LINKING.has(vbBase);
    const isDi=DITRANSITIVE.has(vb)||DITRANSITIVE.has(vbBase);
    const isOcC=OC_CONSIDER.has(vb)||OC_CONSIDER.has(vbBase);
    const isCau=CAUSATIVE.has(vb)||CAUSATIVE.has(vbBase);
    const isPerc=PERCEPTION.has(vb)||PERCEPTION.has(vbBase);
    const isInd=INDUCTIVE.has(vb)||INDUCTIVE.has(vbBase);
    const isOcG=OC_GENERAL.has(vb)||OC_GENERAL.has(vbBase);
    const isIntO=INTRANS_ONLY.has(vb)||INTRANS_ONLY.has(vbBase);

    let tokens=[],prepPh=[],toInf=null;
    let i=si;
    while(i<words.length){
        // to부정사 인식: to + 동사(DB) 또는 to + 비명사/비관사/비전치사 단어
        if(lw[i]==='to'&&i+1<words.length&&!words[i+1].endsWith('ing')&&!words[i+1].endsWith('ed')){
            const nextW=lw[i+1];
            const isToInf=isV(words[i+1])||(!ART.has(nextW)&&!PREP.has(nextW)&&!isAdv(words[i+1])&&!PRO_S.has(nextW)&&!PRO_O.has(nextW)&&!DEMO.has(nextW)&&!CONJ.has(nextW));
            if(isToInf){
                toInf=words.slice(i); break;
            }
        }
        if(PREP.has(lw[i])&&!(lw[i]==='to'&&i+1<words.length&&(isV(words[i+1])||(!ART.has(lw[i+1])&&!PREP.has(lw[i+1])&&!isAdv(words[i+1])&&!PRO_S.has(lw[i+1])&&!DEMO.has(lw[i+1])&&!CONJ.has(lw[i+1]))))){
            let pp=[words[i]];i++;
            while(i<words.length&&!PREP.has(lw[i])&&lw[i]!=='to'){pp.push(words[i]);i++;}
            prepPh.push(pp.join(' ')); continue;
        }
        tokens.push(words[i]); i++;
    }
    let lt=tokens.map(lo);

    // ================================================================
    // 형식 판별 (양박사님 방식)
    // 동사 뒤 명사 개수 + 이퀄 관계
    // ================================================================

    // 1형식: 자동사 + 부사만
    if(isIntO&&tokens.every(t=>isAdv(t)||CONJ.has(lo(t)))){
        R.modV.push(...tokens,...prepPh);
        if(toInf) R.modV.push(toInf.join(' '));
        return;
    }

    // 순수 연결동사 → 2형식 확정
    if(isPure&&tokens.length>0){
        assignComp(tokens, R);
        R.modV.push(...prepPh);
        if(toInf) R.modV.push(toInf.join(' '));
        return;
    }

    // ================================================================
    // 이퀄 관계 판별 (양박사님 핵심):
    // 동사 뒤 명사가 1그룹만 있을 때:
    //   - S = C (이퀄) → 2형식
    //   - S ≠ O → 3형식
    // 동사가 linking에만 있으면 무조건 2형식
    // 동사가 다중 분류(OC_CONSIDER, DITRANSITIVE 등)이면 이퀄 판별
    // "She made a good wife" → she=wife → 2형식
    // "She made a good meal" → she≠meal → 3형식
    // ================================================================

    // LINKING 전용 (non-pure, not in other categories) → 2형식
    if(isLnk&&!isPure&&!isDi&&!isOcC&&tokens.length>0){
        assignComp(tokens, R);
        R.modV.push(...prepPh);
        if(toInf) R.modV.push(toInf.join(' '));
        return;
    }

    // 다중 분류 동사: 이퀄 관계로 2형식 vs 3/4/5형식 판별
    // make, turn, keep, grow, get, prove 등은 여러 형식 가능
    // LINKING 또는 OC_CONSIDER(make 등)에 있는 동사만 2형식 후보
    // to부정사가 있으면 2형식 체크를 건너뜀
    if((isDi||isOcC||isLnk)&&tokens.length>0){
        // to부정사 OC가 있고 OC_GENERAL/사역/지각이면 → 이퀄 체크 건너뛰고 5형식으로
        if(toInf&&(isOcG||isCau||isPerc||isInd)){
            // 5형식 로직으로 넘김 (아래 블록에서 처리)
        } else if(isLnk||isOcC) {
        // LINKING 또는 OC_CONSIDER 동사일 때 이퀄 관계 2형식 체크
        let nounP=[],advP=[];
        for(const t of tokens){
            if(isAdv(t)&&!PRO_O.has(lo(t)))advP.push(t);else nounP.push(t);
        }

        // OC 패턴 감지: 대명사/명사 + 형용사 → 5형식 (her happy, him sad 등)
        let isOcPattern=false;
        if(nounP.length>=2){
            const first=nounP[0], rest=nounP.slice(1);
            if((PRO_O.has(lo(first))||(!isAdj(first)&&!ART.has(lo(first))))&&
               rest.every(w=>isAdj(w)||isAdv(w))){
                isOcPattern=true;
            }
        }
        if(countNounGroups(nounP)>=2) isOcPattern=true;

        // 명사가 1그룹이고 OC 패턴이 아니고 주어와 이퀄이면 → 2형식
        if(!isOcPattern&&nounP.length>0&&countNounGroups(nounP)<=1&&isEqualRelation(R.sub.head, nounP)){
            assignComp(nounP, R);
            R.modV.push(...advP,...prepPh);
            if(toInf) R.modV.push(toInf.join(' '));
            return;
        }
        }
        // 이퀄 아니면 → 아래 일반 로직(3/4/5형식)으로 진행
    }

    // 5형식: to부정사 OC → (ones) + to부정사를 수식어로 (교수님 체계)
    if(toInf&&(isOcG||isCau||isPerc||isInd)&&tokens.length>0){
        R.obj=splitNP(tokens);
        R.oc={head:'(ones)',mods:[toInf.join(' ')]};
        if(isCau)R.verbSub='사역동사';else if(isPerc)R.verbSub='지각동사';
        else if(isInd)R.verbSub='유도동사';else R.verbSub='비사역동사';
        R.modV.push(...prepPh); return;
    }

    // 5형식: 사역/지각 + O + 원형부정사
    // "made him clean the room" — 사역/지각 뒤 대명사 다음 단어는 원형부정사일 가능성 높음
    if((isCau||isPerc)&&tokens.length>=2){
        let objEnd=-1;
        for(let j=0;j<tokens.length;j++){
            if(PRO_O.has(lt[j])){objEnd=j;break;}
            if(j>0&&isV(tokens[j])&&!isAdj(tokens[j])){objEnd=j-1;break;}
        }
        // 사역/지각 문맥: 대명사 뒤 단���가 관사/전치사/접속사가 아니면 동사로 추정
        // "him clean the room" → clean은 원형부정사
        let nextIsVerb=false;
        if(objEnd>=0&&objEnd+1<tokens.length){
            const nxt=lt[objEnd+1];
            nextIsVerb=isV(tokens[objEnd+1])&&!isAdj(tokens[objEnd+1]);
            // 동사DB에 없어도: 관사/전치사/접속사/부사가 아니고 뒤에 토큰이 더 있으면 동사로 추정
            if(!nextIsVerb&&!ART.has(nxt)&&!PREP.has(nxt)&&!CONJ.has(nxt)&&!isAdv(tokens[objEnd+1])&&objEnd+2<tokens.length){
                nextIsVerb=true;
            }
            // 형용사겸용이지만 뒤에 관사+명사가 있으면 동사 (clean the room)
            if(!nextIsVerb&&isAdj(tokens[objEnd+1])&&objEnd+2<tokens.length&&ART.has(lt[objEnd+2])){
                nextIsVerb=true;
            }
        }
        if(objEnd>=0&&nextIsVerb){
            R.obj=splitNP(tokens.slice(0,objEnd+1));
            let ocAll=tokens.slice(objEnd+1);
            let ocVerb=ocAll[0], ocRest=ocAll.slice(1);
            let ocObj=[],ocAdv=[];
            for(const w of ocRest){if(isAdv(w))ocAdv.push(w);else ocObj.push(w);}
            let ocPhrase=ocVerb+(ocObj.length?' '+ocObj.join(' '):'');
            R.oc={head:'(ones)',mods:[ocPhrase,...ocAdv]};
            if(isCau)R.verbSub='사역동사';else R.verbSub='지각동사';
            R.modV.push(...prepPh); return;
        }
    }

    // 5형식: 간주동사 + O + OC (O=OC 이퀄 관계)
    // "They called him a genius" → him=genius (5형식)
    // "He made her happy" → her+happy (OC=형용사, 5형식)
    // "She made a good meal" → 1그룹만 → 3형식으로 빠져야 함
    if(isOcC&&tokens.length>=2){
        // 패턴1: 대명사 + 형용사 → O + OC(형용사)
        if(PRO_O.has(lt[0])){
            let rest=tokens.slice(1);
            if(rest.length>0&&rest.every(w=>isAdj(w)||isAdv(w))){
                // him happy, her sad 등
                R.obj={head:tokens[0],mods:[]};
                let adjH=rest.filter(w=>isAdj(w)&&!ART.has(lo(w)));
                let adjM=rest.filter(w=>isAdv(w)||ART.has(lo(w)));
                R.oc={head:adjH.length?adjH[adjH.length-1]:'(one)',mods:adjM};
                R.verbSub='간주동사'; R.modV.push(...prepPh); return;
            }
            // 대명사 + 명사구 → O=OC(이퀄)이면 5형식, 아니면 4형식(IO+DO)
            if(rest.length>0){
                let restNP=splitNP(rest);
                // IO=O인지 OC=O인지 판별: 대명사와 뒤 명사가 이퀄이면 5형식
                if(isEqualRelation(tokens[0], rest)){
                    R.obj={head:tokens[0],mods:[]};
                    R.oc=restNP;
                    R.verbSub='간주동사'; R.modV.push(...prepPh); return;
                }
                // 이퀄 아니고 DITRANSITIVE이면 4형식 (IO+DO)
                if(isDi){
                    R.io={head:tokens[0],mods:[]};
                    R.obj=restNP;
                    R.modV.push(...prepPh); if(toInf)R.modV.push(toInf.join(' ')); return;
                }
                // 그 외: 5형식
                R.obj={head:tokens[0],mods:[]};
                R.oc=restNP;
                R.verbSub='간주동사'; R.modV.push(...prepPh); return;
            }
        }
        // 패턴2: 명사구 + 형용사/명사 → 2개 그룹이면 5형식
        let nGroups=countNounGroups(tokens);
        if(nGroups>=2){
            // 첫 번째 명사그룹 = O, 두 번째 = OC
            let objW=[],ocW=[],foundHead=false;
            for(let j=0;j<tokens.length;j++){
                if(!foundHead){
                    objW.push(tokens[j]);
                    if(!ART.has(lt[j])&&!isAdj(tokens[j])&&!isAdv(tokens[j])){
                        foundHead=true;
                    }
                } else ocW.push(tokens[j]);
            }
            if(ocW.length>0){
                R.obj=splitNP(objW); R.oc=splitNP(ocW);
                R.verbSub='간주동사'; R.modV.push(...prepPh); return;
            }
        }
        // 패턴3: 명사구 + 끝 형용사 → O + OC(형용사)
        if(tokens.length>=2){
            let last=tokens[tokens.length-1];
            if(isAdj(last)&&!ART.has(lo(last))){
                let objTokens=tokens.slice(0,-1);
                R.obj=splitNP(objTokens);
                R.oc={head:last,mods:[]};
                R.verbSub='간주동사'; R.modV.push(...prepPh); return;
            }
        }
        // 1개 그룹만 → 3형식으로 빠짐 (아래 로직)
    }

    // 4형식: O1≠O2 (두 목적어가 다른 것)
    if(isDi&&tokens.length>=2&&!isOcC){
        let ioW=[],doW=[],found=false;
        for(let j=0;j<tokens.length;j++){
            if(!found){
                if(PRO_O.has(lt[j])){ioW.push(tokens[j]);found=true;}
                else if(j>0&&ART.has(lt[j])){found=true;doW.push(tokens[j]);}
                else{ioW.push(tokens[j]);if(!ART.has(lt[j])&&j>0)found=true;}
            } else doW.push(tokens[j]);
        }
        if(doW.length>0){
            R.io=splitNP(ioW); R.obj=splitNP(doW);
            R.modV.push(...prepPh); if(toInf)R.modV.push(toInf.join(' ')); return;
        }
    }

    // 3형식 / 1형식
    let objP=[],advP=[];
    for(const t of tokens){
        if(isAdv(t)&&!PRO_O.has(lo(t)))advP.push(t);else objP.push(t);
    }
    if(objP.length>0&&!isIntO) R.obj=splitNP(objP);
    else advP.push(...objP);

    // 전치사구 분류: of → 형용사구 (명사에 붙임), 나머지 → 부사구
    for(const pp of prepPh){
        const ppType=classifyPrepPhrase(pp);
        if(ppType==='adj'){
            // of 전치사구를 가장 가까운 명사의 수식어로 추가
            if(R.obj.head) R.obj.mods.push(pp);
            else if(R.comp.head) R.comp.mods.push(pp);
            else if(R.sub.head) R.sub.mods.push(pp);
            else R.modV.push(pp);
        } else {
            R.modV.push(pp);
        }
    }

    R.modV.push(...advP);
    if(toInf){
        R.modV.push(toInf.join(' '));
    }
}

// 보어 할당 헬퍼
function assignComp(tokens, R){
    if(isAdjComp(tokens)){
        let adjMods=[], advMods=[];
        for(const t of tokens){
            if(isAdv(t)) advMods.push(t);
            else adjMods.push(t);
        }
        R.comp={head:'(one)', mods:[...adjMods,...advMods]};
        if(!R.comp.mods.some(m=>ART.has(lo(m)))) R.comp.mods.unshift('(a)');
    } else {
        let np=splitNP(tokens);
        R.comp=np;
    }
}

function detType(R){
    if(R.type)return;

    // _ingMod 후처리 (하위 호환)
    if(R._ingMod){
        if(!R.comp.head){
            R.comp={head:'(one)',mods:['(a)', R._ingMod]};
        } else {
            R.comp.mods.push(R._ingMod);
        }
        delete R._ingMod;
    }

    if(R.oc.head){R.type='5형식';R.typeKo='복합형';R.verbStyle="'이다'고+'하다'";}
    else if(R.io.head&&R.obj.head){R.type='4형식';R.typeKo='수여형';R.verbStyle="'주다'";}
    else if(R.obj.head){R.type='3형식';R.typeKo='소유형';R.verbStyle="'하다'";}
    else if(R.comp.head){R.type='2형식';R.typeKo='의존형';R.verbStyle="'이다/되다'";}
    else{R.type='1형식';R.typeKo='자존형';R.verbStyle="'있다'";}
}
