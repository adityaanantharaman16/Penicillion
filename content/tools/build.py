"""Compile the dated, private Penicillion content release from reviewed selections."""
import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DRAFT = ROOT/'editorial'
OPEN_POOL = set('instruments upper-bones arteries fungi bacterial-species gram-neg heart receptors hormones hydrolases amino-acids imaging joints autoimmune cells-lab hematology'.split())
OPENERS = set('human-cells cell-parts bacterial-genera gut brain eyeball airways ear veins sleep reflex fluids cranial-nerves vitamins vaccines'.split())
FAMILIES = {'anatomy':'Human anatomy','cells':'Cells & histology','biochemistry':'Biochemistry','immunology':'Immunology','instruments':'Surgical instruments','microbiology':'Microbiology','laboratory':'Laboratory methods','physiology':'Physiology','pathology':'Pathology'}
TIERS = {10:('Gross View','disc','A clear first outline.'),15:('Teaching Slide','twin','A classroom classic.'),30:('Fine Focus','triangle','A detail comes into view.'),60:('Special Stain','cross','An extra feature stands out.'),85:('Serial Section','diamond','A deeper layer shows.'),100:('Atlas Plate','star','A find to keep on the page.')}
exceptions = {
 ('cns','Meningitis'):'Descriptor definition locates inflammation in the membranes enclosing the brain or spinal cord.',
 ('cns','Glioblastoma'):'Descriptor definition places this astrocytic malignancy in the central nervous system.',
 ('hormones','Epinephrine'):'Descriptor definition identifies epinephrine as a hormone of the adrenal medulla.',
 ('hormones','Erythropoietin'):'Descriptor definition identifies a hormone produced chiefly by the adult kidney.',
}
bykey = lambda s: unicodedata.normalize('NFKC',s).lower().strip().replace('’',"'").replace('‘',"'").translate(str.maketrans('‐‑‒–—','-----'))
def norm(s): return ' '.join(bykey(s).split())
def read_table(name):
    path = DRAFT/(name+'.tsv')
    return {row[0]:row[1:] for line in path.read_text().splitlines() if line and not line.startswith('#') for row in [line.split('\t')]} if path.exists() else {}
def plain(name):
    if ',' in name: return ' '.join(reversed(name.split(', ')))
    return name
def title(name):
    return name[:1].upper()+name[1:]
def termkey(name,record):
    return 'mesh:'+record['id'] if record else 'pc:'+re.sub('[^a-z0-9]+','-',name.lower()).strip('-')
def get_prompts():
    for path in sorted(DRAFT.glob('*.txt')):
        prompt=None
        for line in path.read_text().splitlines():
            if not line: continue
            if line.startswith('@'):
                if prompt: yield prompt
                ident,text,scope,parents=line[1:].split('|')
                prompt={'id':ident,'topic':FAMILIES[path.stem],'text':text,'scope':scope,'pool':'open' if ident in OPEN_POOL else 'daily','opener':ident in OPENERS,'parents':parents.split('; '),'selections':[]}
            else:
                points,terms = line.split(' ',1)
                prompt['selections'].extend((int(points),s.strip()) for s in terms.split('; '))
        if prompt: yield prompt

singular_changes=(('ies','y'),('ves','f'),('a','um'),('i','us'),('ae','a'),('ices','ex'),('es',''),('s',''))
def matching_form(a,b):
    a,b=sorted([a.lower(),b.lower()],key=len,reverse=True)
    return any(a.endswith(pl) and a[:-len(pl)]+sg==b for pl,sg in singular_changes)
def variants(name,record,custom):
    label=plain(name)
    learned=set()
    if record and not any(t.startswith('B0') for t in record['tree']):
        # Never singularize taxonomic names (e.g. Pseudomonas, Vibrio cholerae).
        # A preferred concept can still have historical broad aliases. Import only
        # inflections and re-ordered labels; meaningful semantic variants are authored.
        for alt in record['names']:
            if ',' in alt: continue
            if matching_form(alt,label):
                learned.add(alt)
                if len(alt)<len(label): label=alt
    if name in custom:
        label,extra=custom[name]
        learned.update(extra.split('|'))
    learned.update([name,plain(name)])
    if name.startswith('Immunoglobulin ') and len(name.rsplit(' ',1)[-1])==1:
        learned.add('Ig'+name[-1])
    if name.startswith('Complement C') and re.fullmatch('C[1-9][abqrs]?',name.removeprefix('Complement ')):
        learned.add(name.removeprefix('Complement '))
    if name.startswith('Bacteriophage '):
        phage=name.removeprefix('Bacteriophage ')
        learned.update([phage,'phage '+phage,phage+' phage'])
    if name.endswith(' Joint'): learned.add(name[:-6]+' joint')
    if record and ',' not in name and len(name.split())==2 and name[0].isupper() and name.split()[1].islower() and any(t.startswith('B03.') for t in record['tree']):
        genus,species=name.split()
        learned.update([genus[0]+'. '+species,genus[0]+' '+species,genus[0]+'.'+species])
    if name.startswith('Factor ') and re.fullmatch('[IVX]+',name.split()[-1]):
        number={'V':5,'VII':7,'VIII':8,'IX':9,'X':10,'XI':11,'XII':12,'XIII':13}[name.split()[-1]]
        learned.add('factor '+str(number))
    for text in list(learned)+[label]:
        if 'Anemia' in text: learned.add(text.replace('Anemia','Anaemia'))
        if 'emia' in text.lower(): learned.add(text.lower().replace('emia','aemia'))
        if 'Hemato' in text: learned.add(text.replace('Hemato','Haemato'))
        if '-' in text: learned.add(text.replace('-',' '))
        if "'s" in text:
            learned.add(text.replace("'s",'s'))
            learned.add(text.replace("'s",''))
    if name == 'Bone and Bones':
        # The catalogue heading joins two forms; its constructed singular is not a term.
        learned.difference_update({'Bone and Bone', 'Bone and Bones'})
    # Stable casing is for display only; normalize equality exactly as the server.
    unique={}
    for v in sorted(learned):
        if v.strip() and norm(v)!=norm(label) and len(v)<=96: unique.setdefault(norm(v),v)
    return title(label), list(unique.values())

def main(out):
    mesh=json.loads((DRAFT/'mesh-2026.json').read_text())
    bylower={k.lower():(k,v) for k,v in mesh.items()}
    places={t:k for k,v in mesh.items() for t in v['tree']}
    src=json.loads((DRAFT/'external.json').read_text())
    names=read_table('names'); facts={**read_table('gameplay-facts'), **read_table('facts')}; cues=read_table('cues'); extra=read_table('extra-names'); supplements=read_table('supplements')
    tier_rows=[dict(points=p,name=n,shape=s,flavour=f) for p,(n,s,f) in TIERS.items()]
    release=dict(id='night-culture.2026-11.r1',scoringRelease='recall.1',tiers=tier_rows,sources=[dict(id=k,**v) for k,v in src.items()],prompts=[])
    for prompt in get_prompts():
        roots=prompt.pop('parents'); selections=prompt.pop('selections')
        prompt.update(ambiguous=[],exclusions=[],answers=[])
        for points,raw in selections:
            name,rec=bylower.get(raw.lower(),(raw,None))
            source='mesh'; proof=''; contexts=[]
            if roots[0].startswith('!'):
                source={'Rongeur':'rongeur','Needle holder':'suturing','Gigli saw':'gigli'}.get(name, roots[0][1:])
                proof=src[source]['version']+' · '+name+' is named in the cited source for this group.'
            elif rec:
                pairs=[(parent,root,t) for parent in roots for root in mesh[parent]['tree'] for t in rec['tree'] if t.startswith(root+'.')]
                if pairs:
                    parent,root,tree=min(pairs,key=lambda x:x[2].count('.')-x[1].count('.'))
                    proof=f'{rec["id"]} at {tree}, below {parent} ({root}) in 2026 MeSH. Selected for the stated scope.'
                else: proof=exceptions.get((prompt['id'],name),'')
            if name in supplements: source,proof=supplements[name]
            if not proof: raise ValueError(f'No relationship evidence for {name} in {prompt["id"]}')
            label,aliases=variants(name,rec,names)
            if raw in extra:
                for a in extra[raw][0].split('|'):
                    if norm(a) not in {norm(label),*(norm(b) for b in aliases)}: aliases.append(a)
            if prompt['id']=='clotting' and name in {'Fibrinogen','Prothrombin','Thromboplastin','Calcium'}:
                suffix={'Fibrinogen':('I',1),'Prothrombin':('II',2),'Thromboplastin':('III',3),'Calcium':('IV',4)}[name]
                aliases.extend('factor '+str(s) for s in suffix)
            if roots[0]=='!essential':
                source='amino'
                proof+=' Essential dietary status: '+src['essential']['url']
            if name=='Bacteriophage phi 6':
                source='phi6'
                proof='DSMZ culture DSM 21518; ICTV Cystoviridae report confirms the double-stranded RNA phage of Pseudomonas. MeSH genome wording superseded for this mapping.'
            if src.get(source) is None: raise ValueError(source)
            source_link={'id':source,'label':src[source]['label'],'url':src[source]['url']}
            if source=='mesh': source_link['url']='https://meshb.nlm.nih.gov/record/ui?ui='+rec['id']
            if rec:
                contexts=list(dict.fromkeys(plain(places[p]) for t in rec['tree'] for p in [t.rpartition('.')[0]] if p in places))
            fact=facts.get(name,facts.get(raw,['']))[0]
            if not fact:
                if contexts:
                    relevant=[s for s in contexts if s not in [plain(r) for r in roots]]
                    nearest=(relevant or contexts)[0]
                    fact=f'In the medical subject index, {label} is filed under “{nearest}”.'
                elif roots[0]=='!forearm':
                    fact=f'{label} has its muscle belly in the forearm.'
                else: raise ValueError('Missing original fact or context: '+name)
            cue=cues.get(prompt['id'],[prompt['topic'].lower()])[0]
            reason={10:f'{label} is an opening answer when you picture {cue}.',
                    15:f'{label} is a familiar teaching example for {cue}.',
                    30:f'{label} often comes to mind after the first examples of {cue}.',
                    60:f'Recalling {label} calls for a more specific example of {cue}.',
                    85:f'{label} is a specialist association within {cue}, beyond the usual classroom list.',
                    100:f'The connection between {label} and {cue} makes a distinctive specialist find.'}[points]
            if points==100 and len(cues.get(prompt['id'],[]))>1: reason=cues[prompt['id']][1]
            prompt['answers'].append(dict(id=termkey(name,rec),term=label,aliases=aliases,tier=TIERS[points][0],points=points,reason=reason,fact=fact,source=source_link,evidence=proof))
        if prompt['id'] in ('human-cells','cell-parts','glia','instruments','cranial-nerves','clotting','antibodies','cns'):
            prompt['exclusions']={'human-cells':['mitochondrion','platelet','cell membrane'],'cell-parts':['astrocyte','chloroplast','cell wall'],'glia':['Schwann cell','satellite glial cell','neuron'],'instruments':['implant','gauze','scalpel blade','suture','needle'],'cranial-nerves':['optic disc','optic chiasm','facial artery'],'clotting':['factor VI','factor 6'],'antibodies':['IgG1','kappa'],'cns':['Guillain-Barré syndrome','Guillain-Barre syndrome','peripheral neuropathy','migraine symptom']}[prompt['id']]
        if prompt['id']=='human-cells': prompt['ambiguous']=['PC','EC']
        release['prompts'].append(prompt)
    fingerprint=hashlib.sha256(json.dumps(release,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:12]
    release['id']='night-culture.2026-11.'+fingerprint
    out.write_text(json.dumps(release,ensure_ascii=False,indent=1)+'\n')
    print(f'{len(release["prompts"])} prompts, {sum(len(p["answers"]) for p in release["prompts"])} mappings -> {out}')
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',type=Path,default=ROOT/'release.json')
    main(parser.parse_args().out)
