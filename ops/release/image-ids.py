#!/usr/bin/env python3
"""Resolve the config and optional OCI manifest digests of one docker-save tag."""
import hashlib
import json
import re
import sys
import tarfile


def image_ids(path, tag):
    with tarfile.open(path, "r:gz") as archive:
        def read(name):
            member = archive.getmember(name)
            if not member.isfile() or member.size > 8 * 1024 * 1024:
                raise ValueError(f"invalid image metadata: {name}")
            return archive.extractfile(member).read()

        records = [r for r in json.loads(read("manifest.json")) if tag in (r.get("RepoTags") or [])]
        if len(records) != 1:
            raise ValueError("expected one image with the requested release tag")
        config = "sha256:" + hashlib.sha256(read(records[0]["Config"])).hexdigest()
        yield config
        if "index.json" not in archive.getnames():
            return
        for descriptor in json.loads(read("index.json"))["manifests"]:
            digest = descriptor["digest"]
            if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
                raise ValueError("invalid manifest digest")
            blob = read("blobs/sha256/" + digest[7:])
            if hashlib.sha256(blob).hexdigest() != digest[7:]:
                raise ValueError("manifest digest mismatch")
            if json.loads(blob).get("config", {}).get("digest") == config:
                yield digest


if __name__ == "__main__":
    print(*image_ids(*sys.argv[1:]), sep="\n")
