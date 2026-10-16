"""Opt-in real HF integration: NEIGHBOURS_NATIVE_TEST=1 NODE=node>=24."""
import json
import os
from pathlib import Path
import subprocess
import unittest
from concordia.contrib.neighbours.bridge import NodeBridge
from concordia.contrib.neighbours.engine import TownEngine


@unittest.skipUnless(os.environ.get('NEIGHBOURS_NATIVE_TEST') == '1', 'Set NEIGHBOURS_NATIVE_TEST=1 with npm dependencies installed')
class NativeBridgeTest(unittest.TestCase):
  def test_actual_hf_restore_matches_uninterrupted_run(self):
    with NodeBridge(population=8) as bridge:
      engine = TownEngine(bridge)
      engine.advance(4)
      saved = engine.save()
      expected_view = engine.advance(4)
      expected_save = engine.save()
    with NodeBridge(population=8) as bridge:
      engine = TownEngine(bridge)
      engine.restore(saved)
      self.assertEqual(engine.advance(4), expected_view)
      self.assertEqual(engine.save(), expected_save)

  def test_concordia_matches_same_runtime_direct_control(self):
    with NodeBridge(seed=77, population=208) as bridge:
      engine = TownEngine(bridge)
      engine.advance(8)
      actual = engine.save()['runtime']
    root = Path(__file__).resolve().parents[3]
    code = "import {createRuntime} from './neighbours/src/core/index.ts'; const r=createRuntime(77,208); for(let i=0;i<8;i++)r.step(); process.stdout.write(JSON.stringify(r.export()));"
    reference = subprocess.check_output([os.environ.get('NODE', 'node'), '--input-type=module', '-e', code], cwd=root, text=True)
    self.assertEqual(actual, json.loads(reference))


if __name__ == '__main__': unittest.main()
