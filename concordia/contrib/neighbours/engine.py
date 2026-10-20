"""Concordia scheduling with deterministic host resolution and HF entities.

Only Concordia's core interfaces are imported, so this engine also runs inside
Pyodide. The callable transport is synchronous and returns one JSON value.
"""
import json
from concordia.environment.engine import Engine
from concordia.typing.entity import Entity, ActionSpec, OutputType


class BridgeError(RuntimeError):
  """A runtime response is missing, malformed or explicitly failed."""


class InterventionRejected(ValueError):
  """The host refused an intervention before changing anything; the town stays usable."""


class _Person(Entity):
  def __init__(self, actor_id, request):
    self._name = actor_id
    self.request = request
    self.observation = None

  @property
  def name(self):
    return self._name

  def observe(self, observation):
    self.observation = observation

  def act(self, action_spec):
    if self.observation is None:
      raise RuntimeError('Actor must receive an observation before choosing.')
    action = self.request('choose', actorId=self.name)
    if not isinstance(action, str):
      raise BridgeError('choose must return an action ID string.')
    action_spec.validate(action)
    return action


class _GameMaster(Entity):
  """The host supplies observations and applies already validated actions."""
  def __init__(self, request):
    self.request = request
    self.event = None

  @property
  def name(self):
    return 'Alder Quay deterministic host'

  def observe(self, observation):
    self.event = json.loads(observation)

  def act(self, action_spec):
    if action_spec.output_type == OutputType.MAKE_OBSERVATION:
      result = self.request('observe', actorId=action_spec.call_to_action)
      if not isinstance(result, str):
        raise BridgeError('observe must return a string.')
      return result
    if action_spec.output_type == OutputType.RESOLVE:
      if self.event is None:
        raise RuntimeError('No action to resolve.')
      event, self.event = self.event, None
      result = self.request('apply', **event)
      if result is not None:
        raise BridgeError('apply must return null.')
      return 'resolved'
    raise ValueError('Unsupported game master action.')


class TownEngine(Engine):
  """One round prepares time, then observes/chooses/resolves each ready actor.

  A failed round may have mutated host state. It is deliberately unusable until
  explicit restore succeeds. Checkpoints are available only between rounds.
  """
  def __init__(self, call):
    self.call = call
    self.rounds = 0
    self._ready = True
    self.game_master = _GameMaster(self._request)

  def _request(self, op, **kwargs):
    try:
      response = self.call(json.dumps({'op': op, **kwargs}, allow_nan=False))
      result = json.loads(response)
    except Exception as exc:
      raise BridgeError(f'{op}: missing or invalid bridge reply: {exc}') from exc
    if isinstance(result, dict) and 'error' in result:
      raise BridgeError(f'{op}: {result["error"]}')
    return result

  def _require_ready(self):
    if not self._ready:
      raise RuntimeError('Round incomplete; restore a completed checkpoint before continuing.')

  def make_observation(self, game_master, entity):
    return game_master.act(ActionSpec(call_to_action=entity.name,
                                      output_type=OutputType.MAKE_OBSERVATION))

  def next_acting(self, game_master, entities):
    del game_master
    actor = entities[0]
    offers = self._request('offers', actorId=actor.name)
    if (not isinstance(offers, list) or not offers or
        any(not isinstance(o, dict) or not isinstance(o.get('id'), str) or
            not o['id'] or not isinstance(o.get('label'), str) for o in offers)):
      raise BridgeError('offers must be a nonempty list of named action IDs.')
    return actor, ActionSpec(call_to_action='Choose an available town activity.',
                             output_type=OutputType.CHOICE,
                             options=tuple(o['id'] for o in offers))

  def resolve(self, game_master, event):
    game_master.observe(event)
    game_master.act(ActionSpec(call_to_action='Resolve the validated action.',
                               output_type=OutputType.RESOLVE))

  def terminate(self, game_master):
    del game_master
    return False  # The caller explicitly bounds every run.

  def next_game_master(self, game_master, game_masters):
    if len(game_masters) != 1 or game_masters[0] is not game_master:
      raise ValueError('Town has exactly one deterministic game master.')
    return game_master

  def advance(self, rounds=1, checkpoint_callback=None):
    if type(rounds) is not int or not 0 <= rounds <= 10000:
      raise ValueError('rounds must be an integer between 0 and 10000.')
    self._require_ready()
    for _ in range(rounds):
      self._ready = False
      ids = self._request('prepare')
      if (not isinstance(ids, list) or
          any(not isinstance(i, str) or not i for i in ids) or
          len(set(ids)) != len(ids)):
        raise BridgeError('prepare must return unique actor ID strings.')
      gm = self.next_game_master(self.game_master, [self.game_master])
      for actor_id in ids:
        actor = _Person(actor_id, self._request)
        actor.observe(self.make_observation(gm, actor))
        actor, spec = self.next_acting(gm, [actor])
        action = actor.act(spec)
        self.resolve(gm, json.dumps({'actorId': actor.name, 'actionId': action}))
      self.rounds += 1
      self._ready = True
      if checkpoint_callback is not None:
        checkpoint_callback(self.rounds)
    return self.view()

  def run_loop(self, game_masters=(), entities=(), premise='', max_steps=100,
               verbose=False, log=None, checkpoint_callback=None,
               step_controller=None, step_callback=None):
    if game_masters or entities or premise or step_controller or step_callback:
      raise ValueError('Town owns entities and game master; use advance or bounded run_loop.')
    del verbose
    result = self.advance(max_steps, checkpoint_callback)
    if log is not None:
      log.append({'rounds': self.rounds, 'view': result})
    return result

  def view(self):
    result = self._request('view')
    if not isinstance(result, dict):
      raise BridgeError('view must return an object.')
    return result

  def save(self):
    self._require_ready()
    return {'schema': 'neighbours/concordia@1', 'rounds': self.rounds,
            'runtime': self._request('save')}

  def restore(self, save):
    if (not isinstance(save, dict) or save.get('schema') != 'neighbours/concordia@1'
        or type(save.get('rounds')) is not int or save['rounds'] < 0
        or not isinstance(save.get('runtime'), dict)
        or type(save['runtime'].get('round')) is not int
        or save['runtime']['round'] != save['rounds']
        or save['runtime'].get('pending') != []):
      raise ValueError('Invalid Concordia town checkpoint.')
    self._ready = False
    if self._request('restore', save=save['runtime']) is not None:
      raise BridgeError('restore must return null.')
    self.rounds = save['rounds']
    self._ready = True

  def intervene(self, intervention):
    self._require_ready()
    # A transport failure may happen after mutation. Require restore in that case.
    self._ready = False
    result = self._request('intervene', intervention=intervention)
    if (isinstance(result, dict) and list(result) == ['rejected'] and
        isinstance(result['rejected'], str)):
      # The host checked its own state is unchanged before answering this way.
      self._ready = True
      raise InterventionRejected(result['rejected'])
    if result is not None:
      raise BridgeError('intervene must return null.')
    self._ready = True
    return self.view()

  def inspect(self, actor_id):
    return self._request('inspect', actorId=actor_id)
