"""Bounded native upstream GM proposal experiment; host rules remain authoritative.

EventResolution runs the model-backed resolution step. MakeObservation carries
only a validated proposal to the host inbox, with generative fallback disabled.
No resident receives information and no world mutation happens in this module.
"""
import hashlib
import json
import os
import re
import selectors
import subprocess
import tempfile
import time

from concordia.agents import entity_agent
from concordia.components.agent import memory
from concordia.components.game_master import event_resolution, make_observation, next_acting, switch_act
from concordia.language_model import language_model
from concordia.typing import entity

UPSTREAM_SHA = '6fbfbc58f324aa74f78568c488713210889a801e'
SCHEMA = 'neighbours-gm-proposal@1'
KEYS = {'schema', 'kind', 'target', 'cue', 'windowMinutes'}
MAX_PROPOSAL_BYTES = 4096
MAX_CLI_ENVELOPE_BYTES = 1024 * 1024


def digest(value):
  return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def validate_proposal(value):
  """Reject invented outcomes, recipients and capabilities before host delivery."""
  if (not isinstance(value, dict) or set(value) != KEYS
      or value.get('schema') != SCHEMA
      or value.get('kind') != 'inspection-request'
      or value.get('target') != 'hall-annex'
      or value.get('cue') not in ('dry-sound', 'wet-sound', 'unsupported')
      or type(value.get('windowMinutes')) is not int
      or not 60 <= value['windowMinutes'] <= 1440):
    raise ValueError('Proposal violates the host situation allowlist')
  return dict(value)


def parse_proposal(raw):
  if not isinstance(raw, str) or len(raw.encode('utf-8')) > MAX_PROPOSAL_BYTES:
    raise ValueError('Proposal must be text of at most 4096 UTF-8 bytes')
  def unique(pairs):
    value = {}
    for key, item in pairs:
      if key in value:
        raise ValueError('Duplicate proposal key')
      value[key] = item
    return value
  return validate_proposal(json.loads(raw, object_pairs_hook=unique))


class ProviderUsageLimit(BaseException):
  """Stop the complete evidence wave; ordinary failed-case handlers must not continue."""


def refuse_usage_limit(raw):
  if re.search(r"usage[_ -]limit|rate_limit_error|rate limit exceeded|(?:you've|you have) hit (?:your )?(?:usage |rate )?limit|insufficient credits|quota exhausted|out of extra usage", raw, re.IGNORECASE):
    raise ProviderUsageLimit('USAGE LIMIT — Claude provider stopped the evidence wave; no retry or substitute.')


def bounded_cli_output(command, cwd, timeout=100, max_bytes=MAX_CLI_ENVELOPE_BYTES):
  """Terminate an oversized/late subprocess without retaining its envelope."""
  deadline = time.monotonic() + timeout
  with subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as process:
    try:
      output, diagnostic = bytearray(), bytearray()
      with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ, output)
        selector.register(process.stderr, selectors.EVENT_READ, diagnostic)
        while selector.get_map():
          remaining = deadline - time.monotonic()
          events = selector.select(max(0, remaining)) if remaining > 0 else []
          if not events:
            raise TimeoutError('Claude CLI exceeded the 100-second response deadline')
          for key, _ in events:
            chunk = os.read(key.fileobj.fileno(), min(65536, max_bytes + 1 - len(output) - len(diagnostic)))
            if not chunk:
              selector.unregister(key.fileobj)
              continue
            key.data.extend(chunk)
            # A detected stop must escape failed-case handlers immediately, including stderr-only
            # errors and messages followed by a sleeping or oversized provider process.
            refuse_usage_limit((output + diagnostic).decode('utf-8', errors='replace'))
            if len(output) + len(diagnostic) > max_bytes:
              raise RuntimeError('Claude CLI envelope exceeded the 1 MiB byte limit')
      code = process.wait(timeout=max(0.001, deadline - time.monotonic()))
      if code:
        raise RuntimeError(f'Claude CLI failed with exit status {code}')
      return output.decode('utf-8')
    finally:
      if process.poll() is None:
        process.kill()
        process.wait()



class ClaudeCliModel(language_model.LanguageModel):
  """One isolated CLI call per sample; never retain the session envelope."""

  def __init__(self, model='opus', max_calls=1):
    if type(max_calls) is not int or not 1 <= max_calls <= 8:
      raise ValueError('Model budget must be 1..8 calls')
    self.model = model
    self.max_calls = max_calls
    self.tape = []
    self.cli_version = subprocess.check_output(['claude', '--version'], text=True).strip()

  def sample_text(self, prompt, **kwargs):
    # CLI does not expose Concordia's max_tokens/temperature sampling controls.
    # The actual bounds are one call, a 100-second deadline and byte limits.
    del kwargs
    if len(self.tape) >= self.max_calls:
      raise RuntimeError('Native GM model-call budget exhausted')
    # Account for failed attempts as well: there is no retry or policy fallback.
    entry = {'promptSha256': digest(prompt), 'status': 'attempted'}
    self.tape.append(entry)
    with tempfile.TemporaryDirectory(prefix='neighbours-gm-') as directory:
      raw = bounded_cli_output([
          'claude', '--print', '--model', self.model, '--effort', 'low',
          '--output-format', 'json', '--tools', '', '--disable-slash-commands',
          '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
          '--setting-sources', '', '--no-session-persistence', '--no-chrome',
          '--system-prompt', 'Propose one fictional town situation using only the requested JSON schema. Return plain JSON. Your words cannot establish outcomes, knowledge, expertise, consent or attendance.',
          '--', prompt], cwd=directory)
    envelope = json.loads(raw)
    if envelope.get('is_error') is not False or not isinstance(envelope.get('result'), str):
      raise RuntimeError('Claude CLI returned no successful text result')
    models = envelope.get('modelUsage')
    if not isinstance(models, dict) or not models:
      raise RuntimeError('Claude CLI did not identify its actual model')
    entry.update(status='completed', rawResponse=envelope['result'],
                 modelIds=sorted(models), requestedModel=self.model,
                 cliVersion=self.cli_version)
    return entry['rawResponse']

  def sample_choice(self, prompt, responses, *, seed=None):
    raise RuntimeError('GM experiment does not permit model-selected actors or recipients')


class ReplayModel(language_model.LanguageModel):
  """Recorded responses only, bound to exact regenerated upstream prompts."""

  def __init__(self, tape):
    self.tape = tape
    self.cursor = 0

  def sample_text(self, prompt, **kwargs):
    if self.cursor >= len(self.tape):
      raise ValueError('Replay tape exhausted')
    entry = self.tape[self.cursor]
    if entry.get('status') != 'completed' or entry.get('promptSha256') != digest(prompt):
      raise ValueError('Replay prompt or response status mismatch')
    self.cursor += 1
    return entry['rawResponse']

  def sample_choice(self, prompt, responses, *, seed=None):
    raise RuntimeError('Replay cannot select actors or recipients')


def checkpoint_context(checkpoint):
  """Project saved host facts; retained rule counts do not certify expertise."""
  runtime = checkpoint.get('runtime', {})
  if runtime.get('format') == 'neighbours-native':
    physical = runtime['physical']
    native_people = runtime['owner']['run']['current']['people']
    residents = []
    for resident in physical['people']:
      person = native_people.get(resident['id'])
      if person is None or person.get('id') != resident['id']:
        raise ValueError('Host resident has no matching native person')
      residents.append({**resident, 'person': person})
    # Only the bounded context below leaves the complete current checkpoint.
    # The source packet and native person state remain unchanged.
    runtime = {**physical, 'people': residents}
  now = runtime.get('now')
  hall = next((p for p in runtime.get('places', []) if p.get('id') == 'hall'), {})
  residents = []
  for resident in runtime.get('people', []):
    person = resident['person']
    rules = [rule for rule in person.get('methods', {}).get('rules', [])
             if rule.get('id') == 'hall-section-inspection']
    job = resident.get('job')
    current_job = None if not job else {
        'actionId': job['offer']['id'], 'action': job['offer']['action'],
        'label': job['offer']['label'], 'placeId': job['offer'].get('placeId'),
        'arrivesAt': job['arrive'], 'endsAt': job['end'],
    }
    residents.append({
        'id': person['id'], 'name': person['name'], 'role': resident['role'],
        'placeId': resident['place'], 'currentHostJob': current_job,
        'retainedInspectionRuleCount': len(rules),
        'retainedInspectionEvidenceCount': sum(len(rule.get('evidence', [])) for rule in rules),
    })
  social = runtime.get('socialEvenings') or {}
  evenings = list(social.get('events', []))
  for cycle in social.get('recurrence', {}).get('cycles', []):
    evenings.extend(cycle.get('events', []))
  future = [event for event in evenings
            if isinstance(now, (int, float)) and event['endsAt'] >= now]
  return {
      'time': {'minute': now,
               'day': now // 1440 + 1 if isinstance(now, (int, float)) else None,
               'minuteOfDay': now % 1440 if isinstance(now, (int, float)) else None},
      'hall': {'repairUnits': runtime.get('hall'), 'safe': runtime.get('hallSafe'),
               'capacity': hall.get('capacity')},
      'residents': sorted(residents, key=lambda resident: resident['id']),
      'nextSocialEvents': [{key: event[key] for key in (
          'id', 'kind', 'organiserId', 'startsAt', 'endsAt', 'stage')}
                           for event in sorted(future, key=lambda event: (event['startsAt'], event['id']))[:6]],
      'limits': [
          'These are host records, not shared resident knowledge.',
          'Rule and evidence counts report retained HF state; they do not establish expertise or a future choice.',
          'A social candidate or proposal is not attendance or a completed event.',
          'Null means no recorded value; no current host job does not establish willingness or availability.',
      ],
  }


def run_director(model, checkpoint):
  """Return a proposal/rejection and upstream inbox evidence, never an outcome."""
  checkpoint_hash = digest(checkpoint)
  context = checkpoint_context(checkpoint)
  request = (
      'Request one inspection opportunity at the hall annex in a fictional town. '
      'The host may reject it. This is a request, not damage or a completed repair. '
      f'Exact host checkpoint SHA256: {checkpoint_hash}. '
      f'Actual saved fictional town context: {json.dumps(context, sort_keys=True, separators=(",", ":"))}. '
      'Use these facts to choose a relevant inspection opportunity and time window. '
      'Each allowed cue specifies a hypothetical annex condition for the host to validate; '
      'it is not a diagnosis of the existing hall. dry-sound means dry timber and '
      'sound supports; wet-sound means wet timber and sound supports; unsupported '
      'means both observations are unknown to the inspection method. '
      'Return exactly one JSON object with these keys and values: '
      '{"schema":"neighbours-gm-proposal@1","kind":"inspection-request",'
      '"target":"hall-annex","cue":"dry-sound OR wet-sound OR unsupported",'
      '"windowMinutes": integer from 60 through 1440}. '
      'Select exactly one allowed cue string. Do not add prose or keys. '
      'Do not select recipients, diagnose an existing fault, confer expertise or assert an outcome. '
      'Keep the complete JSON response below 4096 UTF-8 bytes.'
  )
  result = {}

  def propose(document, premise, active_player_name):
    del premise, active_player_name
    raw = document.open_question(question=request, max_tokens=300, terminators=())
    result['rawResponse'] = raw
    try:
      result['proposal'] = parse_proposal(raw)
      result['rejection'] = None
    except (ValueError, TypeError) as error:
      result['proposal'] = None
      result['rejection'] = str(error)
    # Upstream uses "Event" as its resolution label. The text explicitly keeps
    # this a proposal; it does not become a physical event in the town.
    return 'Host proposal validated' if result['proposal'] else 'Host proposal rejected'

  initiative = next_acting.NextActing(model, ['Host'])
  initiative.set_state({'currently_active_player': 'Host'})
  inbox = make_observation.MakeObservation(model, ['Host'], allow_llm_fallback=False)
  resolver = event_resolution.EventResolution(model, [propose], notify_observers=False)
  gm = entity_agent.EntityAgent('Situation director', switch_act.SwitchAct(model, ['Host']), {
      '__memory__': memory.ListMemory(['[putative_event] Host: Request an inspection opportunity.']),
      '__next_acting__': initiative,
      '__resolution__': resolver,
      '__make_observation__': inbox,
  })
  resolution = gm.act(entity.ActionSpec(call_to_action='Resolve the host proposal.', output_type=entity.OutputType.RESOLVE))
  if result['proposal']:
    inbox.add_to_queue('Host', json.dumps(result['proposal'], sort_keys=True))
  spec = entity.ActionSpec(call_to_action=make_observation.DEFAULT_CALL_TO_MAKE_OBSERVATION.format(name='Host'), output_type=entity.OutputType.MAKE_OBSERVATION)
  observation = gm.act(spec)
  empty_observation = gm.act(spec)
  return {**result, 'resolution': resolution, 'hostInbox': observation,
          'emptyInbox': empty_observation, 'checkpointSha256': checkpoint_hash,
          'townContext': context,
          'hostApplied': False, 'residentObservationsDelivered': 0}


def runtime_sources(root):
  """Bind current component replay to actual upstream, host and engineering paths.

  This does not certify a historical HF3 capture or a natural current town case.
  The historical report bodies retain their original, incompatible fingerprint.
  """
  paths = set()
  for folder in ('concordia/agents', 'concordia/components/agent',
                 'concordia/components/game_master', 'concordia/document',
                 'concordia/typing', 'concordia/utils', 'concordia/language_model',
                 'concordia/associative_memory', 'concordia/environment',
                 'concordia/contrib/neighbours'):
    paths.update(p for p in (root / folder).glob('*.py') if not p.name.endswith('_test.py'))
  paths.update((root / 'neighbours/src/core').glob('*.ts'))
  paths.update(root / p for p in ('neighbours/src/contracts.ts', 'neighbours/src/bridge-port.ts',
                                 'neighbours/src/experiments/inspection.ts',
                                 'neighbours/scripts/run-gm-director.py',
                                 'neighbours/scripts/bridge.ts', 'neighbours/scripts/run-town.py',
                                 'neighbours/scripts/check-hf4-continuation.ts',
                                 'neighbours/scripts/check-parity.mjs', 'neighbours/scripts/profile-town.ts',
                                 'neighbours/src/python-session.ts', 'neighbours/src/advance-town.ts',
                                 'neighbours/src/comparison.ts',
                                 'neighbours/native-gm-requirements.txt'))
  files = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}
  package = json.loads((root / 'neighbours/node_modules/@adam0white/human-framework/package.json').read_text())
  identity = {'files': files, 'hf': {'name': package['name'], 'version': package['version']}}
  return {**identity, 'sha256': digest(identity)}


def verify_upstream_sources(root):
  """Check critical upstream components against the pinned Git objects."""
  for name in ('event_resolution.py', 'make_observation.py', 'switch_act.py', 'next_acting.py'):
    path = f'concordia/components/game_master/{name}'
    pinned = subprocess.check_output(['git', 'show', f'{UPSTREAM_SHA}:{path}'], cwd=root)
    if pinned != (root / path).read_bytes():
      raise ValueError(f'Upstream component differs from pinned source: {path}')


def replay_report(report, root):
  if report.get('schema') != 'native-concordia-gm@1' or report.get('upstreamSha') != UPSTREAM_SHA:
    raise ValueError('Unknown GM artifact or upstream version')
  if report.get('runtimeSources') != runtime_sources(root):
    raise ValueError('Runtime sources differ; regenerate actual evidence')
  verify_upstream_sources(root)
  if digest(report['checkpoint']) != report.get('checkpointSha256'):
    raise ValueError('Checkpoint hash mismatch')
  tape = report.get('responseTape')
  if (not isinstance(tape, list) or len(tape) != 1
      or report.get('modelCalls') != 1
      or not isinstance(report.get('cliVersion'), str)
      or not report['cliVersion']
      or not isinstance(report.get('modelIds'), list)
      or not report['modelIds']
      or any(not isinstance(name, str) or not name for name in report['modelIds'])
      or tape[0].get('modelIds') != report['modelIds']
      or tape[0].get('requestedModel') != report.get('requestedModel')
      or tape[0].get('cliVersion') != report['cliVersion']):
    raise ValueError('Invalid model provenance or call count')
  model = ReplayModel(report['responseTape'])
  actual = run_director(model, report['checkpoint'])
  if actual != report['result'] or model.cursor != len(model.tape):
    raise ValueError('Upstream GM replay diverged')
  if (report.get('sourceFingerprint') != report['runtimeSources']['sha256']
      or report.get('proposal') != actual['proposal']
      or report.get('rawResponse') != actual['rawResponse']
      or report.get('rejection') != actual['rejection']):
    raise ValueError('Artifact summary differs from replayed evidence')
  return {'replayExact': True, 'modelCalls': 0, 'checkpointSha256': report['checkpointSha256']}
