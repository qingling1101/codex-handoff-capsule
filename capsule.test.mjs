import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extract, cleanText, workspaceKey, readRecords, chooseSession } from '../scripts/update-capsule.mjs';

const script = fileURLToPath(new URL('../scripts/update-capsule.mjs', import.meta.url));
const event = (type, message) => ({ type: 'event_msg', payload: { type, message } });
const response = (role, text) => ({ type: 'response_item', payload: { type: 'message', role, content: [{ type: 'input_text', text }] } });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capsule-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'session.jsonl');
  const write = (records) => fs.writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n');
  const meta = { type: 'session_meta', payload: { id: 'fictional-session', cwd: root } };
  const run = (...args) => spawnSync(process.execPath, [script, '--workspace', root, '--session', file, ...args], { encoding: 'utf8' });
  return { root, file, write, meta, run };
}

test('reads response-only logs and excludes tools, reasoning and injected setup', () => {
  const result = extract([response('user', 'Build a demo'), response('assistant', 'Done'),
    response('user', '# AGENTS.md instructions for demo\nprivate setup'),
    { type: 'response_item', payload: { type: 'function_call_output', output: 'PRIVATE TOOL DATA' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', phase: 'analysis', content: 'PRIVATE REASONING' } }]);
  assert.deepEqual(result.messages.map(x => x.text), ['Build a demo', 'Done']);
});
test('deduplicates mirrored formats while keeping intentional repetitions', () => {
  const result = extract([event('user_message', 'continue'), response('user', 'continue'), event('agent_message', 'working'),
    response('assistant', 'working'), event('user_message', 'continue'), response('user', 'continue')]);
  assert.deepEqual(result.messages.map(x => x.text), ['continue', 'working', 'continue']);
});
test('status distinguishes completed turn, new request and interruption', () => {
  assert.equal(extract([event('task_complete')]).status, 'turn_complete');
  assert.equal(extract([event('task_complete'), response('user', 'continue')]).status, 'in_progress');
  assert.equal(extract([event('turn_aborted')]).status, 'interrupted');
});
test('redacts common credentials and embedded images', () => {
  const input = 'password=fictional-secret Bearer fictional-auth ghp_' + 'x'.repeat(30) + ' data:image/png;base64,AAAA';
  const output = cleanText(input);
  for (const secret of ['fictional-secret', 'fictional-auth', 'x'.repeat(30), 'base64']) assert.ok(!output.includes(secret));
});
test('same basename in different workspaces gets separate storage', () => {
  assert.notEqual(workspaceKey(path.resolve('a/demo')), workspaceKey(path.resolve('b/demo')));
});
test('bounded tail tolerates an unfinished line and preserves metadata', t => {
  const f = fixture(t);
  f.write([f.meta, event('agent_message', 'x'.repeat(5000)), response('user', 'recent')]);
  fs.appendFileSync(f.file, '{"unfinished":');
  const result = readRecords(f.file, 300);
  assert.equal(result.truncated, true);
  assert.equal(result.malformed, 1);
  assert.equal(extract(result.records).id, 'fictional-session');
  assert.equal(extract(result.records).messages[0].text, 'recent');
});
test('empty input does not overwrite an existing capsule', t => {
  const f = fixture(t); f.write([f.meta]);
  const out = path.join(f.root, 'saved.md'); fs.writeFileSync(out, 'keep this');
  assert.equal(f.run('--output', out).status, 1);
  assert.equal(fs.readFileSync(out, 'utf8'), 'keep this');
});
test('CLI writes useful output and leaves the source unchanged', t => {
  const f = fixture(t); f.write([f.meta, response('user', 'Create fictional demo')]);
  const original = fs.readFileSync(f.file, 'utf8');
  const run = f.run('--codex-home', f.root);
  assert.equal(run.status, 0, run.stderr);
  assert.match(fs.readFileSync(run.stdout.trim(), 'utf8'), /Create fictional demo/);
  assert.equal(fs.readFileSync(f.file, 'utf8'), original);
});
test('CLI refuses workspace mismatch and unknown flags', t => {
  const f = fixture(t); f.write([{ ...f.meta, payload: { ...f.meta.payload, cwd: path.join(f.root, 'other') } }, response('user', 'hello')]);
  assert.equal(f.run('--stdout').status, 1);
  assert.equal(f.run('--typo').status, 1);
});
test('session discovery includes archived sessions and more than 16 files', t => {
  const f = fixture(t);
  const dir = path.join(f.root, 'sessions'); fs.mkdirSync(dir);
  for (let i = 0; i < 20; i++) fs.writeFileSync(path.join(dir, `${i}.jsonl`), JSON.stringify({ ...f.meta, payload: { cwd: path.join(f.root, 'other') } }));
  const archive = path.join(f.root, 'archived_sessions'); fs.mkdirSync(archive);
  const target = path.join(archive, 'old.jsonl'); fs.writeFileSync(target, JSON.stringify(f.meta));
  assert.equal(chooseSession(f.root, f.root), target);
});
