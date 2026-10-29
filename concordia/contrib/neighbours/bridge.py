"""Persistent Node transport for the same runtime used in the browser."""
import json
import os
from pathlib import Path
import selectors
import subprocess
from concordia.contrib.neighbours.engine import BridgeError


class NodeBridge:
  """One Node process, sequenced replies, bounded wait, no automatic retries."""
  def __init__(self, seed=42, population=206, node=None, timeout=30, script=None, args=()):
    self.timeout = timeout
    self.sequence = 0
    self.failed = False
    root = Path(__file__).resolve().parents[3]
    executable = node or os.environ.get('NODE', 'node')
    major = int(subprocess.check_output([executable, '--version'], text=True).strip().lstrip('v').split('.')[0])
    if major < 24:
      raise RuntimeError('Node >=24 required; set NODE to a supported executable.')
    self.process = subprocess.Popen(
        [executable, str(script or root / 'neighbours/scripts/bridge.ts'),
         '--seed', str(seed), '--population', str(population), *args],
        cwd=root / 'neighbours', stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=None, text=True, bufsize=1)
    self.selector = selectors.DefaultSelector()
    self.selector.register(self.process.stdout, selectors.EVENT_READ)

  def __call__(self, request):
    if self.failed:
      raise BridgeError('Native transport failed; restart from a saved checkpoint.')
    self.sequence += 1
    try:
      self.process.stdin.write(json.dumps({'seq': self.sequence, 'request': json.loads(request)}) + '\n')
      self.process.stdin.flush()
      if not self.selector.select(self.timeout):
        raise BridgeError('Timed out waiting for the Node runtime.')
      line = self.process.stdout.readline()
      if not line:
        raise BridgeError('Node runtime exited without a reply.')
      reply = json.loads(line)
      if not isinstance(reply, dict) or reply.get('seq') != self.sequence or 'result' not in reply:
        raise BridgeError('Native reply sequence or envelope is invalid.')
      return json.dumps(reply['result'], allow_nan=False)
    except Exception as exc:
      self.failed = True
      if isinstance(exc, BridgeError):
        raise
      raise BridgeError(f'Native transport failed: {exc}') from exc

  def close(self):
    self.selector.close()
    if self.process.stdin:
      self.process.stdin.close()
    try:
      self.process.wait(timeout=3)
    except subprocess.TimeoutExpired:
      self.process.kill()
      self.process.wait()
    if self.process.stdout:
      self.process.stdout.close()

  def __enter__(self):
    return self

  def __exit__(self, *_):
    self.close()
