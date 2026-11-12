"""Extract traceable relationships for the editor-selected descriptors, offline."""
import argparse
import gzip
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path

HOME = Path(__file__).resolve().parents[1]
INPUT_HASH = 'ccd4d0d33bebfd4c836a59e7dd0c635b1d4e20c4f5a6abc55e2eb0ba4c8716dd'

def descriptor_file(path):
    if hashlib.sha256(path.read_bytes()).hexdigest() != INPUT_HASH:
        raise ValueError('Pin and review a new source revision before changing the source digest.')
    result = {}
    with gzip.open(path, 'rb') as stream:
        for _, node in ET.iterparse(stream, events=('end',)):
            if node.tag != 'DescriptorRecord':
                continue
            name = node.findtext('DescriptorName/String')
            preferred = node.find('ConceptList/Concept[@PreferredConceptYN="Y"]')
            result[name] = {'id': node.findtext('DescriptorUI'), 'tree': [t.text for t in node.findall('TreeNumberList/TreeNumber')],
                            'names': [t.text for t in preferred.findall('TermList/Term/String')]}
            node.clear()
    return result

def main(path):
    records = descriptor_file(path)
    indexed = {key.lower(): key for key in records}
    positions = {tree: key for key, record in records.items() for tree in record['tree']}
    names = set()
    for file in sorted((HOME/'editorial').glob('*.txt')):
        for line in file.read_text().splitlines():
            if not line: continue
            if line.startswith('@'):
                names.update(line.split('|')[-1].split('; '))
            else:
                names.update(line.split(' ',1)[1].split('; '))
    needed = {indexed[n.lower()] for n in names if n.lower() in indexed}
    for name in list(needed):
        for tree in records[name]['tree']:
            direct = positions.get(tree.rpartition('.')[0])
            if direct: needed.add(direct)
    subset = {name: records[name] for name in sorted(needed)}
    output = HOME/'editorial'/'mesh-2026.json'
    output.write_text(json.dumps(subset,ensure_ascii=False,indent=1)+'\n')
    print(f'{len(subset)} MeSH descriptor records, including parent evidence.')
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('file', type=Path)
    main(parser.parse_args().file)
