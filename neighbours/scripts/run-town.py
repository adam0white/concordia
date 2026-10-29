#!/usr/bin/env python3
"""Run actual Python Concordia with persistent Node HF; emit a JSON artifact."""
import argparse
import hashlib
import json
import gzip
from pathlib import Path
import sys
import time

from recording_codec import load_checkpoint

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from concordia.contrib.neighbours.bridge import NodeBridge
from concordia.contrib.neighbours.engine import TownEngine


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--rounds', type=int, default=12)
  parser.add_argument('--seed', type=int, default=42)
  parser.add_argument('--population', type=int, default=206)
  parser.add_argument('--output', type=Path)
  parser.add_argument('--restore', type=Path)
  parser.add_argument('--node')
  parser.add_argument('--proof-directory', type=Path,
                      help='Retain every actual engine/bridge request and response; no simulation changes.')
  args = parser.parse_args()
  start = time.perf_counter()
  proof_records = []
  if args.proof_directory:
    args.proof_directory.mkdir(parents=True, exist_ok=False)
  with NodeBridge(seed=args.seed, population=args.population, node=args.node) as bridge:
    def call(request):
      index = len(proof_records) + 1
      record = {'request': request}
      try:
        response = bridge(request)
        record['response'] = response
        return response
      except Exception as exc:
        record['error'] = {'type': type(exc).__name__, 'message': str(exc)}
        raise
      finally:
        if args.proof_directory:
          raw = json.dumps(record, ensure_ascii=False, allow_nan=False).encode()
          name = f'rpc-{index:06d}.json.gz'
          with gzip.open(args.proof_directory / name, 'wb') as stream:
            stream.write(raw)
          with gzip.open(args.proof_directory / name, 'rb') as stream:
            assert stream.read() == raw
          proof_records.append({'path': name, 'bytes': len(raw),
                                'sha256': hashlib.sha256(raw).hexdigest()})
          (args.proof_directory / 'manifest.json').write_text(
              json.dumps({'scope': 'Actual engine/bridge request and response bodies',
                          'records': proof_records}, indent=2) + '\n')
    engine = TownEngine(call)
    source_checkpoint = None
    if args.restore:
      source = load_checkpoint(args.restore)
      source_checkpoint = source.get('checkpoint', source)
      checked = json.loads(call(json.dumps({'op': 'validate-checkpoint-source',
                                             'packet': source_checkpoint})))
      if checked is not True:
        raise ValueError(f'Invalid checkpoint source receipt: {checked}')
      engine.restore(source_checkpoint)
    view = engine.advance(args.rounds)
    save = engine.save()
    if source_checkpoint:
      # Keep original top-level source/provenance fields; engine state comes only from save().
      for key, value in source_checkpoint.items():
        if key not in ('schema', 'rounds', 'runtime'):
          save[key] = value
    digest = hashlib.sha256(json.dumps(save, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    result = {'runtime': 'native-python-concordia-node-hf', 'checkpoint': save,
              'view': view, 'checkpointSha256': digest,
              'wallSeconds': time.perf_counter() - start}
    encoded = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
      args.output.parent.mkdir(parents=True, exist_ok=True)
      args.output.write_text(encoded)
      print(json.dumps({'output': str(args.output), 'rounds': engine.rounds,
                        'checkpointSha256': digest, 'wallSeconds': result['wallSeconds']}))
    else:
      print(encoded, end='')


if __name__ == '__main__':
  main()
