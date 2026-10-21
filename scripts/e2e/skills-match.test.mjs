import assert from 'node:assert/strict';
import { makeTextMatcher, analyzeCoverage } from '../../server/skillMatch.js';
import { validateAndFixSkills } from '../../server/cvValidation.js';

// makeTextMatcher
const matches = makeTextMatcher('We use GitLab CI/CD and Node.js, C++ and C#.');
for (const term of ['CI/CD', 'gitlab ci/cd', 'Node.js', 'C++', 'C#']) {
  assert.ok(matches(term), `expected "${term}" to match`);
}
assert.ok(!makeTextMatcher('We run on Google Cloud.')('Go'), 'Go must not match Google Cloud');
assert.ok(makeTextMatcher('We write Helm charts.')('Helm chart'), 'singular term matches a plural in the text');

// analyzeCoverage
const result = analyzeCoverage({
  jdKeywords: ['Kubernetes', 'Terraform', 'Azure', 'Rust', 'Snowflake'],
  jobDescription: 'We need Kubernetes, Terraform, Azure and Rust.',
  cvText: 'Kubernetes Terraform Azure',
  writtenText: 'Kubernetes Terraform Azure',
  profileText: 'Kubernetes Terraform Rust',
});
assert.equal(result.total, 4);
assert.deepEqual(result.matched, ['Kubernetes', 'Terraform', 'Azure']);
assert.deepEqual(result.missing, [{ term: 'Rust', inProfile: true }]);
assert.deepEqual(result.unsupported, ['Azure']);
assert.equal(result.coverage, 0.75);

// validateAndFixSkills: mixed string/object items, case-insensitive dedupe
const { coreSkills } = validateAndFixSkills([
  { category: 'Cloud', items: ['AWS', { skill: 'aws' }, { skill: 'Kubernetes', source: 'jd' }, 'Terraform', '  '] },
]);
assert.deepEqual(coreSkills[0].items.map((i) => i.skill), ['AWS', 'Kubernetes', 'Terraform']);

console.log('skills-match: ok');

// makeProfileMatcher / dropUnbackedSkills
{
  const { makeProfileMatcher, dropUnbackedSkills } = await import('../../server/skillMatch.js');
  const backed = makeProfileMatcher('Argo CD, Jenkins');
  assert.ok(backed('GitOps'), 'Argo CD backs GitOps');
  assert.ok(backed('CI/CD'), 'Jenkins backs CI/CD');
  assert.ok(!backed('HashiCorp Vault'));

  const guarded = dropUnbackedSkills(
    [
      { category: 'Security', items: [{ skill: 'HashiCorp Vault', source: 'base' }] },
      { category: 'Tools', items: [{ skill: 'Terraform', source: 'base' }, { skill: 'Bash', source: 'base' }, { skill: 'HashiCorp Vault', source: 'base' }] },
    ],
    { jobDescription: 'Terraform and HashiCorp Vault', profileText: 'Terraform, Bash' },
  );
  assert.deepEqual(guarded.removed, ['HashiCorp Vault', 'HashiCorp Vault']);
  assert.equal(guarded.coreSkills.length, 1, 'empty category is dropped');
  assert.deepEqual(guarded.coreSkills[0].items.map((i) => i.skill), ['Terraform', 'Bash']);
  console.log('skills-match (profile guard): ok');
}
