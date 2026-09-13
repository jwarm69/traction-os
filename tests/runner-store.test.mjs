import assert from 'node:assert/strict';
import { hashSecret, newSecret, pairCode, validatePairCode, validateDeviceName, validateId } from '../lib/runner-store.ts';

assert.equal(hashSecret('same'), hashSecret('same'));
assert.notEqual(hashSecret('same'), hashSecret('other'));
assert.equal(newSecret().length > 30, true);
assert.match(pairCode(), /^[A-F0-9]{16}$/);
assert.equal(validatePairCode('abcdef0123456789'), 'ABCDEF0123456789');
assert.equal(validateDeviceName('  laptop  '), 'laptop');
assert.equal(validateId('job_123', 'job id'), 'job_123');
assert.throws(() => validatePairCode('short'));
assert.throws(() => validateDeviceName(''));
assert.throws(() => validateId('bad id'));
console.log('runner store helper tests passed');
