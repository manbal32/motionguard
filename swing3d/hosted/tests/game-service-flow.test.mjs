import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('new visitors have no unconditional game shortcut; returning access is separate from predicted playback',()=>{
 const html=fs.readFileSync('dist/client/index.html','utf8'),map=fs.readFileSync('dist/client/map.html','utf8'),round=fs.readFileSync('dist/client/round.html','utf8'),testPage=fs.readFileSync('dist/client/play.html','utf8');
 assert.doesNotMatch(html,/<a[^>]+href="\.\/(?:play|game)(?:[.\/?"])/);
 assert.doesNotMatch(map,/<a[^>]+href="\.\/(?:play|game)(?:[.\/?"])/);
 assert.doesNotMatch(round,/href="\.\/(?:play|game)/);
 assert.match(round,/data-embedded-round="true"/);assert.doesNotMatch(round,/data-quick-play/);
 assert.match(testPage,/게임 기능 테스트/);assert.match(testPage,/data-quick-play="true"/);
 for(const page of [round,testPage])for(const script of ['rivera-game-engine.js','rivera-game.js','course-golfer.js'])assert.ok(page.includes(script));
 assert.match(html,/id="returning-service"[^>]*hidden/);assert.match(html,/service-access\.js/);assert.match(html,/simulation-round\.js/);assert.match(html,/embedded-simulation\.js/);assert.doesNotMatch(html,/rivera-game(?:-sound)?\.js/);assert.match(html,/rivera-game-engine\.js/);assert.match(html,/course-wind\.js/);
});
