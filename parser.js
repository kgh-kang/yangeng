// ================================================================
//  교수님 체계 영문 구문 분석 엔진
//  핵심: 메인라인 = head만, 관사/형용사/부사 = 전부 아래 수식어
//  2형식 형용사 보어 → (one) 복원, 형용사는 수식어
// ================================================================

const BE=new Set('am is are was were be been being'.split(' '));
const LINKING=new Set([...BE,...'seem seems seemed appear appears appeared become becomes became remain remains remained stay stays stayed look looks looked sound sounds sounded feel feels felt taste tastes tasted smell smells smelled smelt grow grows grew grown turn turns turned get gets got gotten go goes went gone prove proves proved proven keep keeps kept fall falls fell fallen'.split(' ')]);
const PURE_LINKING=new Set([...BE,...'seem seems seemed become becomes became remain remains remained'.split(' ')]);
const DITRANSITIVE=new Set('give gives gave given send sends sent tell tells told show shows showed shown teach teaches taught buy buys bought bring brings brought offer offers offered lend lends lent write writes wrote written hand hands handed pass passes passed pay pays paid promise promises promised read reads throw throws threw thrown wish wishes wished ask asks asked award awards awarded grant grants granted owe owes owed leave leaves left make makes made cook cooks cooked get gets got sing sings sang sung save saves saved find finds found'.split(' '));
const OC_CONSIDER=new Set('call calls called name names named make makes made find finds found keep keeps kept leave leaves left consider considers considered think thinks thought believe believes believed elect elects elected appoint appoints appointed declare declares declared prove proves proved proven render renders rendered drive drives drove driven turn turns turned paint paints painted dye dyes dyed color colors colored'.split(' '));
const CAUSATIVE=new Set('make makes made let lets have has had'.split(' '));
const PERCEPTION=new Set('see sees saw seen watch watches watched hear hears heard feel feels felt smell smells smelled smelt notice notices noticed observe observes observed'.split(' '));
const INDUCTIVE=new Set('help helps helped get gets got gotten'.split(' '));
const OC_GENERAL=new Set('tell tells told ask asks asked want wants wanted expect expects expected advise advises advised allow allows allowed cause causes caused enable enables enabled encourage encourages encouraged force forces forced invite invites invited order orders ordered permit permits permitted persuade persuades persuaded remind reminds reminded require requires required urge urges urged warn warns warned forbid forbids forbade forbidden'.split(' '));
const AUX=new Set('do does did have has had will would shall should can could may might must need dare ought'.split(' '));
const PREP=new Set('in on at to for with by from of about into through during before after above below between under over up down out off near around against along across behind beside beyond among upon within without toward towards until since except like unlike despite throughout'.split(' '));
const ART=new Set(['a','an','the']);
const CONJ=new Set(['and','or','nor','but','yet']);
const PRO_S=new Set('i you he she it we they who what which that one there'.split(' '));
const PRO_O=new Set('me you him her it us them whom myself yourself himself herself itself ourselves themselves'.split(' '));
const DEMO=new Set(['this','that','these','those']);
const ADV_SET=new Set('very so too really quite rather pretty extremely always never often sometimes usually already still just also even only here there now then today yesterday tomorrow soon early late fast slowly quickly well badly hard easily carefully certainly probably perhaps maybe definitely surely clearly simply together alone again almost enough ever far however instead long much nearly not once away back how when where why up down out off continuously earnestly thoroughly simultaneously instantly constantly merely'.split(' '));
const ADJ_SET=new Set('good bad great big small large little old new young long short high low hot cold warm cool fast slow happy sad angry beautiful ugly nice fine open closed rich poor strong weak hard soft easy difficult important simple complex full empty clean dirty dark light bright deep wide narrow thick thin flat round sharp smooth quiet loud safe dangerous free busy ready sorry sure true false real possible impossible necessary available famous popular serious terrible wonderful amazing excellent perfect brilliant fantastic gorgeous handsome lovely pretty ambitious afraid alive alone asleep awake aware glad proud brave calm clever cruel curious dear eager fair faithful familiar fierce fond foolish gentle grateful guilty humble innocent jealous keen kind lazy loyal modest nervous patient polite rare rude selfish shy silly sincere stupid suspicious tall tiny tough vast violent visible wise worthy diligent special precise accurate electronic sophisticated similar conventional'.split(' '));
const INTRANS_ONLY=new Set('rise rises rose risen arrive arrives arrived die dies died exist exists existed happen happens happened shine shines shone rain rains rained wander wanders wandered sleep sleeps slept'.split(' '));

const lo=w=>w.toLowerCase();
function isAdj(w){const l=lo(w);if(ADJ_SET.has(l))return true;return/(?:ful|less|ous|ive|ible|able|ent|ant|ical|ish)$/i.test(w);}
function isAdv(w){const l=lo(w);if(ADV_SET.has(l))return true;if(/ly$/i.test(w)&&!ADJ_SET.has(l)&&l!=='lovely'&&l!=='lonely'&&l!=='friendly'&&l!=='early')return true;return false;}
function isV(w){const l=lo(w);return BE.has(l)||AUX.has(l)||LINKING.has(l)||DITRANSITIVE.has(l)||OC_CONSIDER.has(l)||CAUSATIVE.has(l)||PERCEPTION.has(l)||INDUCTIVE.has(l)||OC_GENERAL.has(l)||INTRANS_ONLY.has(l)||/(?:ed|es)$/i.test(w);}

function tok(s){return s.replace(/[!?.]+$/,'').replace(/,/g,' ').trim().split(/\s+/).filter(w=>w);}

// 명사구 분리: head + mods
function splitNP(words){
    if(!words.length) return {head:'',mods:[]};
    if(words.length===1) return {head:words[0],mods:[]};
    let headIdx=words.length-1;
    for(let i=words.length-1;i>=0;i--){
        const l=lo(words[i]);
        if(!ART.has(l)&&!isAdj(words[i])&&!isAdv(words[i])&&!CONJ.has(l)){headIdx=i;break;}
    }
    const head=words[headIdx];
    const mods=[...words.slice(0,headIdx),...words.slice(headIdx+1)];
    return {head,mods};
}

// 2형식 형용사보어 판별
function isAdjComp(words){
    return words.every(w=>isAdj(w)||isAdv(w)||CONJ.has(lo(w))||ART.has(lo(w)));
}

// 메인 파서
function parse(sentence){
    const orig=sentence.trim();
    const words=tok(orig);
    if(!words.length) return null;
    const lw=words.map(lo);

    let R={
        orig, sub:{head:'',mods:[]}, verb:'', comp:{head:'',mods:[]},
        obj:{head:'',mods:[]}, io:{head:'',mods:[]}, oc:{head:'',mods:[]},
        modV:[], toInf:null,
        type:'',typeKo:'',verbStyle:'',sentType:'평서문',verbSub:''
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
                let ingWord=words[se];
                let base=ingWord.replace(/ing$/i,'');
                if(base.length>=3&&base[base.length-1]===base[base.length-2]) base=base.slice(0,-1);
                R.verb=words[auxI];
                R._ingMod='~ing '+base;
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
    for(let i=0;i<words.length;i++){
        if(i===0&&PRO_S.has(lw[i])){R.sub={head:words[0],mods:[]};vi=1;break;}
        if(i===0&&DEMO.has(lw[i])&&words.length>1&&(isV(words[1])||AUX.has(lw[1])||BE.has(lw[1]))){
            R.sub={head:words[0],mods:[]};vi=1;break;
        }
        if(i>0){
            if(AUX.has(lw[i])||BE.has(lw[i])){
                R.sub=splitNP(words.slice(0,i));vi=i;break;
            }
            if(isV(words[i])&&!isAdj(words[i])){
                R.sub=splitNP(words.slice(0,i));vi=i;break;
            }
            if(isV(words[i])&&isAdj(words[i])){
                if(i+1<words.length&&!isV(words[i+1]))continue;
                R.sub=splitNP(words.slice(0,i));vi=i;break;
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
    let parts=[],idx=vi;
    while(idx<words.length&&AUX.has(lw[idx])){
        parts.push(words[idx]);idx++;
        if(idx<words.length&&lw[idx]==='not'){parts.push(words[idx]);idx++;}
    }
    if(idx<words.length){
        if(parts.length>0&&BE.has(lo(parts[parts.length-1]))&&words[idx].endsWith('ing')&&isV(words[idx])){
            let ingWord=words[idx]; idx++;
            let base=ingWord.replace(/ing$/i,'');
            if(base.length>=3&&base[base.length-1]===base[base.length-2]) base=base.slice(0,-1);
            R._ingMod='~ing '+base;
        } else {
            parts.push(words[idx]);idx++;
        }
    }
    R.verb=parts.join(' ');
    parseRem(words,lw,idx,R);
}

function parseRem(words,lw,si,R){
    if(si>=words.length)return;
    const vb=lo(R.verb.split(' ').pop());
    const isLnk=LINKING.has(vb), isPure=PURE_LINKING.has(vb);
    const isDi=DITRANSITIVE.has(vb), isOcC=OC_CONSIDER.has(vb);
    const isCau=CAUSATIVE.has(vb), isPerc=PERCEPTION.has(vb);
    const isInd=INDUCTIVE.has(vb), isOcG=OC_GENERAL.has(vb);
    const isIntO=INTRANS_ONLY.has(vb);

    let tokens=[],prepPh=[],toInf=null;
    let i=si;
    while(i<words.length){
        if(lw[i]==='to'&&i+1<words.length&&isV(words[i+1])&&!words[i+1].endsWith('ing')&&!words[i+1].endsWith('ed')){
            toInf=words.slice(i); break;
        }
        if(PREP.has(lw[i])&&!(lw[i]==='to'&&i+1<words.length&&isV(words[i+1]))){
            let pp=[words[i]];i++;
            while(i<words.length&&!PREP.has(lw[i])&&lw[i]!=='to'){pp.push(words[i]);i++;}
            prepPh.push(pp.join(' ')); continue;
        }
        tokens.push(words[i]); i++;
    }
    let lt=tokens.map(lo);

    // 1형식
    if(isIntO&&tokens.every(t=>isAdv(t)||CONJ.has(lo(t)))){
        R.modV.push(...tokens,...prepPh);
        if(toInf) R.modV.push(toInf.join(' '));
        return;
    }

    // 2형식
    if(isPure||(isLnk&&!isDi&&!isOcC&&tokens.length>0)){
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
        R.modV.push(...prepPh);
        if(toInf) R.modV.push(toInf.join(' '));
        return;
    }

    // 5형식: to부정사 OC
    if(toInf&&(isOcG||isCau||isPerc||isInd)&&tokens.length>0){
        R.obj=splitNP(tokens);
        R.oc={head:toInf.join(' '),mods:[]};
        if(isCau)R.verbSub='사역동사';else if(isPerc)R.verbSub='지각동사';
        else if(isInd)R.verbSub='유도동사';else R.verbSub='비사역동사';
        R.modV.push(...prepPh); return;
    }

    // 5형식: 사역/지각 + O + 원형부정사
    if((isCau||isPerc)&&tokens.length>=2){
        let objEnd=-1;
        for(let j=0;j<tokens.length;j++){
            if(PRO_O.has(lt[j])){objEnd=j;break;}
            if(j>0&&isV(tokens[j])&&!isAdj(tokens[j])){objEnd=j-1;break;}
        }
        if(objEnd>=0&&objEnd+1<tokens.length&&isV(tokens[objEnd+1])&&!isAdj(tokens[objEnd+1])){
            R.obj=splitNP(tokens.slice(0,objEnd+1));
            let ocAll=tokens.slice(objEnd+1);
            let ocVerb=ocAll[0], ocRest=ocAll.slice(1);
            let ocObj=[],ocAdv=[];
            for(const w of ocRest){if(isAdv(w))ocAdv.push(w);else ocObj.push(w);}
            let ocHead=ocVerb+(ocObj.length?' '+ocObj.join(' '):'');
            R.oc={head:ocHead,mods:ocAdv};
            if(isCau)R.verbSub='사역동사';else R.verbSub='지각동사';
            R.modV.push(...prepPh); return;
        }
    }

    // 5형식: 간주동사
    if(isOcC&&tokens.length>=2){
        let objW=[],ocW=[],found=false;
        for(let j=0;j<tokens.length;j++){
            if(!found){
                if(PRO_O.has(lt[j])){objW.push(tokens[j]);found=true;}
                else{objW.push(tokens[j]);if(!ART.has(lt[j])&&j>0)found=true;}
            } else ocW.push(tokens[j]);
        }
        if(ocW.length>0){
            R.obj=splitNP(objW); R.oc=splitNP(ocW);
            R.verbSub='간주동사'; R.modV.push(...prepPh); return;
        }
        if(objW.length>=2){
            let last=objW[objW.length-1];
            if(isAdj(last)&&!ART.has(lo(last))){
                R.oc={head:objW.pop(),mods:[]};
                R.obj=splitNP(objW);
                R.verbSub='간주동사'; R.modV.push(...prepPh); return;
            }
        }
    }

    // 4형식
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
    R.modV.push(...advP,...prepPh);
    if(toInf){
        if(R.obj.head) R.modV.push(toInf.join(' '));
        else R.modV.push(toInf.join(' '));
    }
}

function detType(R){
    if(R.type)return;

    // _ingMod 후처리
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
