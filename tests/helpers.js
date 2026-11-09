'use strict';

const path = require('path');

/** 固定时间：2026-11-04T10:15:00+08:00，用于确定性重放。 */
const FIXED_NOW = Date.UTC(2026, 10, 4, 2, 15, 0);

function makeDeps(overrides) {
  const files = new Map();
  const deps = {
    outputDir: path.join(__dirname, '..', '.tmp-output'),
    now: () => FIXED_NOW,
    writeFile: (target, content) => {
      files.set(target, content);
    },
    ...(overrides || {})
  };
  return { deps, files };
}

function artifactOf(result, type) {
  return (result.artifacts || []).find((item) => item.type === type) || null;
}

function artifactText(result, files, type) {
  const artifact = artifactOf(result, type);
  if (!artifact) return '';
  return files.get(artifact.path) || '';
}

module.exports = { FIXED_NOW, makeDeps, artifactOf, artifactText };
