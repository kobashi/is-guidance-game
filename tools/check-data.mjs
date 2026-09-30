#!/usr/bin/env node
// data/ の JSON が正しい形式かを確認する。
//   node tools/check-data.mjs
// 問題があれば一覧を表示して終了コード 1 で終わる。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SFX_NAMES, BGM_NAMES } from '../js/audio.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const STAGE_COUNT = 4;

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim() !== '';

/** "a.b.c" のパスにある値が空でない文字列か確認する */
function requireStrings(file, obj, paths) {
  for (const p of paths) {
    const v = p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (!isStr(v)) err(file, `"${p}" に文字列が必要です`);
  }
}

// ---------------------------------------------------------------- 読み込み

const data = {};
for (const name of readdirSync(DATA).filter((f) => f.endsWith('.json')).sort()) {
  try {
    data[name] = JSON.parse(readFileSync(join(DATA, name), 'utf8'));
  } catch (e) {
    err(name, `JSON として読めません（${e.message}）`);
  }
}

// ---------------------------------------------------------------- ui.json

const checks = {
  'ui.json'(ui) {
    requireStrings('ui.json', ui, [
      'header.progressLabel', 'header.mute', 'header.unmute', 'header.settings', 'header.debug',
      'title.heading', 'title.lead', 'title.soundGroup', 'title.soundOn', 'title.soundOff',
      'title.start', 'title.continue', 'title.restart', 'title.restartConfirm', 'title.note',
      'title.emblem.left', 'title.emblem.right', 'title.emblem.whole',
      'map.heading', 'map.stageLabel', 'map.play', 'map.replay', 'map.locked', 'map.cleared',
      'map.bestRank', 'map.endingName', 'map.ending', 'map.back',
      'stage.label', 'stage.loadError', 'placeholder.note', 'placeholder.clear',
      'clear.heading', 'clear.rankLabel', 'clear.mistakes', 'clear.time', 'clear.next', 'clear.toEnding', 'clear.skipHint',
      'ending.heading', 'ending.honorLabel', 'ending.honor', 'ending.message', 'ending.linksHeading',
      'ending.reset', 'ending.resetConfirm',
      'settings.heading', 'settings.sound', 'settings.bgmVolume', 'settings.sfxVolume', 'settings.hint', 'settings.close',
    ]);
    if (!Array.isArray(ui.stages) || ui.stages.length !== STAGE_COUNT) {
      err('ui.json', `"stages" は ${STAGE_COUNT} 個の配列にしてください`);
    } else {
      ui.stages.forEach((s, i) => {
        if (!isStr(s?.name) || !isStr(s?.short)) err('ui.json', `stages[${i}] に name と short が必要です`);
      });
    }
    const r = ui.rank;
    if (!isObj(r)) err('ui.json', '"rank" が必要です');
    else {
      for (const k of ['S', 'A']) {
        if (!Number.isInteger(r[k]) || r[k] < 0) err('ui.json', `"rank.${k}" は 0 以上の整数にしてください`);
      }
      if (Number.isInteger(r.S) && Number.isInteger(r.A) && r.S > r.A) err('ui.json', '"rank.S" は "rank.A" 以下にしてください');
    }
  },

  // -------------------------------------------------------------- sounds.json
  'sounds.json'(s) {
    if (typeof s.defaultEnabled !== 'boolean') err('sounds.json', '"defaultEnabled" は true か false にしてください');
    for (const k of ['bgm', 'sfx']) {
      const v = s.volume?.[k];
      if (typeof v !== 'number' || v < 0 || v > 1) err('sounds.json', `"volume.${k}" は 0〜1 の数にしてください`);
    }
    const checkGroup = (group, names) => {
      if (!isObj(s[group])) {
        err('sounds.json', `"${group}" が必要です`);
        return;
      }
      for (const n of names) {
        if (!(n in s[group])) err('sounds.json', `"${group}.${n}" がありません`);
      }
      for (const [n, entry] of Object.entries(s[group])) {
        const where = `"${group}.${n}"`;
        if (!names.includes(n)) warn('sounds.json', `${where} はゲーム内で使われていません（使える名前：${names.join(', ')}）`);
        if (!isObj(entry)) {
          err('sounds.json', `${where} はオブジェクトにしてください`);
          continue;
        }
        if (entry.source === 'synth') continue;
        if (entry.source !== 'file') {
          err('sounds.json', `${where}.source は "synth" か "file" にしてください`);
          continue;
        }
        if (!isStr(entry.path)) {
          err('sounds.json', `${where}.path に音源ファイルのパスが必要です`);
          continue;
        }
        if (/^([a-z]+:)?\/\//i.test(entry.path) || entry.path.startsWith('/')) {
          err('sounds.json', `${where}.path は "assets/audio/..." の相対パスにしてください（外部URLや / 始まりは不可）`);
          continue;
        }
        if (!entry.path.startsWith('assets/audio/')) warn('sounds.json', `${where}.path は assets/audio/ に置くことを推奨します`);
        if (!existsSync(join(ROOT, entry.path))) err('sounds.json', `${where}.path のファイル ${entry.path} がありません`);
        if (entry.volume !== undefined && (typeof entry.volume !== 'number' || entry.volume < 0 || entry.volume > 1)) {
          err('sounds.json', `${where}.volume は 0〜1 の数にしてください`);
        }
      }
    };
    checkGroup('sfx', SFX_NAMES);
    checkGroup('bgm', BGM_NAMES);
  },

  // -------------------------------------------------------------- system.json（ステージ1）
  'system.json'(d) {
    requireStrings('system.json', d, [
      'intro', 'startLabel', 'goalLabel', 'slotLabel', 'slotEmpty', 'slotRemove', 'trayHeading',
      'run', 'running', 'reset', 'avatarIdle', 'stoppedWrong', 'stoppedEmpty',
      'success.status', 'success.kanji', 'success.message', 'success.next',
    ]);
    if (!Array.isArray(d.parts) || d.parts.length < 3 || d.parts.length > 8) {
      err('system.json', '"parts" は 3〜8 個の配列にしてください（正しい順番に並べる）');
      return;
    }
    const ids = new Set();
    d.parts.forEach((p, i) => {
      for (const k of ['id', 'icon', 'label', 'desc']) {
        if (!isStr(p?.[k])) err('system.json', `parts[${i}].${k} が必要です`);
      }
      if (ids.has(p?.id)) err('system.json', `parts[${i}].id "${p.id}" が重複しています`);
      ids.add(p?.id);
    });
  },

  // -------------------------------------------------------------- bugs.json（ステージ2）
  'bugs.json'(d) {
    requireStrings('bugs.json', d, [
      'ui.intro', 'ui.progress', 'ui.storyLabel', 'ui.tapHint', 'ui.wrong', 'ui.hintLabel',
      'ui.correctHeading', 'ui.fixLabel', 'ui.next', 'ui.finish',
    ]);
    const qs = d.questions;
    if (!Array.isArray(qs) || qs.length === 0) {
      err('bugs.json', '"questions" は1問以上の配列にしてください');
      return;
    }
    if (!Number.isInteger(d.required) || d.required < 1) err('bugs.json', '"required"（クリアに必要な正解数）は1以上の整数にしてください');
    else if (d.required > qs.length) err('bugs.json', `"required" (${d.required}) が問題数 (${qs.length}) より多いです`);
    if (qs.length < 5) warn('bugs.json', `問題が ${qs.length} 問です（5問以上を推奨）`);
    const ids = new Set();
    qs.forEach((q, i) => {
      const w = `questions[${i}]${isStr(q?.id) ? `（${q.id}）` : ''}`;
      for (const k of ['id', 'lang', 'title', 'story', 'hint', 'explanation']) {
        if (!isStr(q?.[k])) err('bugs.json', `${w}.${k} が必要です`);
      }
      if (ids.has(q?.id)) err('bugs.json', `${w}.id が重複しています`);
      ids.add(q?.id);
      if (!Array.isArray(q?.code) || q.code.some((l) => typeof l !== 'string')) {
        err('bugs.json', `${w}.code は文字列（1行ずつ）の配列にしてください`);
        return;
      }
      if (q.code.length < 5 || q.code.length > 12) err('bugs.json', `${w}.code は5〜12行にしてください（今は ${q.code.length} 行）`);
      if (!Number.isInteger(q.bugLine) || q.bugLine < 1 || q.bugLine > q.code.length) {
        err('bugs.json', `${w}.bugLine は 1〜${q.code.length} の整数にしてください`);
      } else if (!q.code[q.bugLine - 1].trim()) {
        err('bugs.json', `${w}.bugLine (${q.bugLine}) が空行を指しています`);
      }
      if (q.fix !== undefined && !isStr(q.fix)) err('bugs.json', `${w}.fix は文字列にしてください（不要なら項目ごと消す）`);
    });
  },

  // -------------------------------------------------------------- links.json
  'links.json'(l) {
    if (!Array.isArray(l.links) || l.links.length === 0) {
      err('links.json', '"links" は1つ以上の配列にしてください');
      return;
    }
    l.links.forEach((link, i) => {
      if (!isStr(link?.label)) err('links.json', `links[${i}].label が必要です`);
      if (!isStr(link?.url) || !/^https:\/\//.test(link.url)) err('links.json', `links[${i}].url は https:// で始まるURLにしてください`);
      if (link?.note !== undefined && typeof link.note !== 'string') err('links.json', `links[${i}].note は文字列にしてください`);
    });
  },
};

const REQUIRED = ['ui.json', 'sounds.json', 'links.json', 'system.json', 'bugs.json'];
for (const name of REQUIRED) {
  if (!existsSync(join(DATA, name))) err(name, 'ファイルがありません');
}
for (const [name, value] of Object.entries(data)) {
  if (checks[name]) {
    if (!isObj(value)) err(name, 'いちばん外側は { } のオブジェクトにしてください');
    else checks[name](value);
  } else {
    // bugs.json / curriculum.json / quiz.json の詳しい確認は各ステージの実装時に追加する
    warn(name, 'JSON の形式のみ確認しました（中身の確認は未実装）');
  }
}

// ---------------------------------------------------------------- 結果

const rel = relative(process.cwd(), DATA) || '.';
for (const w of warnings) console.log(`⚠️  ${w}`);
for (const e of errors) console.log(`❌ ${e}`);
if (errors.length) {
  console.log(`\n${rel} に ${errors.length} 件の問題があります。`);
  process.exit(1);
}
console.log(`✅ ${rel} の JSON（${Object.keys(data).length} ファイル）に問題はありません。`);
