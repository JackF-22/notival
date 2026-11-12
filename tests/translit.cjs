const assert=require('node:assert/strict'),T=require('../web/translit.js');
// exact expectations
assert.equal(T.convert('privet'),'привет');
assert.equal(T.convert('Privet, kak dela?'),'Привет, как дела?');
assert.equal(T.convert('spasibo'),'спасибо');
assert.equal(T.convert('ya lyublyu tebya'),'я люблю тебя');
assert.equal(T.convert('khorosho'),'хорошо');
assert.equal(T.convert('chto'),'что');
assert.equal(T.convert('zhizn\''),'жизнь');
assert.equal(T.convert('shkola'),'школа');
assert.equal(T.convert('shchi'),'щи');
assert.equal(T.convert('Shchuka'),'Щука');
assert.equal(T.convert('yolka'),'ёлка');
assert.equal(T.convert('yuliya'),'юлия');
assert.equal(T.convert('my s toboj'),'мы с тобой');
assert.equal(T.convert('tvoj'),'твой');
assert.equal(T.convert('tsvet'),'цвет');
assert.equal(T.convert('ya'),'я');
assert.equal(T.convert('Yabloko'),'Яблоко');
assert.equal(T.convert('SHkola'),'Школа'.replace('Ш','Ш'));
assert.equal(T.convert('ob"yem'),'объем');
assert.equal(T.convert('Moskva 123!'),'Москва 123!');
assert.equal(T.convert('ehto'),'это');assert.equal(T.convert('eheto'),'эето');assert.equal(T.convert("sem'"),'семь');assert.equal(T.convert('ob"yekt'),'объект');
assert.equal(T.convert('voda`'),'вода\u0301','a backtick after a vowel marks the stress');assert.equal(T.convert('zdra`vstvuj'),'здра\u0301вствуй');assert.equal(T.convert('k`'),'к`','a backtick after a consonant stays as typed');
// "с"+"h" outside a pair stays readable: 'skhema' → 'схема' is not possible with sh rule, so ш wins (documented)
assert.equal(T.convert('sh'),'ш');
console.log('PASS: Latin typing becomes Cyrillic, with sh ch zh shch kh yo yu ya pairs and capitals.');
