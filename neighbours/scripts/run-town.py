#!/usr/bin/env python3
"""Run actual Python Concordia with persistent Node HF; emit a JSON artifact."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from concordia.contrib.neighbours.bridge import NodeBridge
from concordia.contrib.neighbours.engine import TownEngine


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--rounds', type=int, default=12)
  parser.add_argument('--seed', type=int, default=42)
  parser.add_argument('--population', type=int, default=208)
  parser.add_argument('--output', type=Path)
  parser.add_argument('--restore', type=Path)
  parser.add_argument('--node')
  args = parser.parse_args()
  start = time.perf_counter()
  with NodeBridge(seed=args.seed, population=args.population, node=args.node) as bridge:
    engine = TownEngine(bridge)
    if args.restore:
      source = json.loads(args.restore.read_text())
      engine.restore(source.get('checkpoint', source))
    view = engine.advance(args.rounds)
    save = engine.save()
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
