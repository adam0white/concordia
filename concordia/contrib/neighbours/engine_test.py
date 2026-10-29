"""Integration contracts for the deterministic town engine."""
import copy
import json
import unittest
from concordia.contrib.neighbours.engine import TownEngine, BridgeError, InterventionRejected
from concordia.environment.engine import Engine


class FakeBridge:
  def __init__(self):
    self.state = {'now': 0, 'round': 0, 'pending': [], 'actions': []}
    self.calls = []
    self.phase = 0
    self.invalid_choice = False
    self.drop = None
    self.reject = None

  def __call__(self, request):
    req = json.loads(request)
    op = req['op']
    self.calls.append(op)
    if op == self.drop:
      return ''
    if op == 'prepare':
      if self.phase == 0:
        self.state['round'] += 1
        requests = [{'id': 'native:start:ada', 'kind': 'action', 'person': 'ada'},
                    {'id': 'native:start:ben', 'kind': 'action', 'person': 'ben'}]
      elif self.phase == 1:
        requests = [{'id': 'native:finish:ada', 'kind': 'action', 'person': 'ada'}]
      else:
        requests = []
        self.state['now'] += 1
      self.state['pending'] = [r['id'] for r in requests]
      result = {'at': self.state['now'], 'done': self.phase == 2, 'requests': requests}
      self.phase = (self.phase + 1) % 3
    elif op == 'observe': result = 'Only your received information.'
    elif op == 'offers': result = [{'id': 'rest', 'label': 'Rest'}]
    elif op == 'choose': result = 'steal' if self.invalid_choice else 'rest'
    elif op == 'apply':
      self.state['actions'].append([req['requestId'], req['actorId'], req['actionId']])
      self.state['pending'].remove(req['requestId'])
      result = None
    elif op == 'view': result = copy.deepcopy(self.state)
    elif op == 'save': result = {'schema': 'neighbours-hf4/1', 'physical': copy.deepcopy(self.state), 'boundary': {'complete': True, 'requests': [], 'resolutions': []}}
    elif op == 'restore':
      self.state = copy.deepcopy(req['save']['physical'])
      self.phase = 0
      result = None
    elif op == 'intervene' and self.reject: result = {'rejected': self.reject}
    else: result = None
    return json.dumps(result)


class TownEngineTest(unittest.TestCase):
  def setUp(self):
    self.bridge = FakeBridge()
    self.engine = TownEngine(self.bridge)

  def test_real_engine_validates_and_resolves_each_actor(self):
    self.assertIsInstance(self.engine, Engine)
    self.assertEqual(self.engine.advance()['actions'], [['native:start:ada', 'ada', 'rest'], ['native:start:ben', 'ben', 'rest'], ['native:finish:ada', 'ada', 'rest']])
    self.assertEqual(self.bridge.calls[:9], ['prepare', 'observe', 'offers', 'choose', 'apply', 'observe', 'offers', 'choose', 'apply'])

  def test_real_actor_identity_is_distinct_from_each_native_request(self):
    self.engine.advance()
    self.assertEqual([a[1] for a in self.bridge.state['actions']], ['ada', 'ben', 'ada'])
    self.assertEqual(len(set(a[0] for a in self.bridge.state['actions'])), 3)

  def test_illegal_choice_never_resolves_and_poisoned_round_needs_restore(self):
    checkpoint = self.engine.save()
    self.bridge.invalid_choice = True
    with self.assertRaises(ValueError): self.engine.advance()
    self.assertNotIn('apply', self.bridge.calls)
    with self.assertRaises(RuntimeError): self.engine.advance()
    with self.assertRaises(RuntimeError): self.engine.save()
    self.bridge.invalid_choice = False
    self.engine.restore(checkpoint)
    self.assertEqual(self.engine.advance()['now'], 1)

  def test_rejected_intervention_keeps_the_town_usable(self):
    self.bridge.reject = 'Every tool is in use; wait for one to come free'
    with self.assertRaises(InterventionRejected): self.engine.intervene({'kind': 'player-work'})
    self.assertEqual(self.engine.advance()['now'], 1)
    self.bridge.reject = None
    self.bridge.drop = 'intervene'
    with self.assertRaises(BridgeError): self.engine.intervene({'kind': 'player-work'})
    with self.assertRaises(RuntimeError): self.engine.advance()

  def test_dropped_reply_is_visible_and_no_checkpoint_callback(self):
    self.bridge.drop = 'apply'
    checkpoints = []
    with self.assertRaises(BridgeError):
      self.engine.advance(checkpoint_callback=checkpoints.append)
    self.assertEqual(checkpoints, [])

  def test_restore_continuation_and_completed_round_callbacks(self):
    checkpoints = []
    self.engine.advance(2, checkpoint_callback=checkpoints.append)
    saved = self.engine.save()
    expected = self.engine.advance(3)
    other = TownEngine(FakeBridge())
    other.restore(saved)
    self.assertEqual(other.advance(3), expected)
    self.assertEqual(checkpoints, [1, 2])
    self.assertEqual(other.save()['rounds'], 5)

  def test_malformed_restore_does_not_touch_bridge(self):
    with self.assertRaises(ValueError): self.engine.restore({'schema': 'bad'})
    self.assertEqual(self.bridge.calls, [])

  def test_restore_rejects_round_mismatch_and_unfinished_round(self):
    for runtime in ({'round': 1, 'pending': []}, {'round': 0, 'pending': ['ada']}, {'pending': []}):
      with self.assertRaises(ValueError):
        self.engine.restore({'schema': 'neighbours/concordia@2', 'rounds': 0, 'runtime': runtime})
    self.assertEqual(self.bridge.calls, [])

  def test_invalid_rounds_rejected_before_mutation(self):
    for rounds in (-1, 1.5, True, 10001):
      with self.assertRaises(ValueError): self.engine.advance(rounds)
    self.assertEqual(self.bridge.calls, [])


if __name__ == '__main__': unittest.main()
