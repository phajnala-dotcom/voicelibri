// Quick test of dialogue detection
const text = `Po dlouhém tichu smrti Joseph Ragowski pozvedl hlas, a nebylo to příjemné, jak po stránce zvukové, tak naladěním. 
„Jen se na sebe podívejte," zvolal, zatímco si zkoumavě prohlížel pětici mágů, jež ho probudila z bezesného spánku. „Všichni vypadáte jako mátohy!"`;

// Test patterns
const patterns = [
  { name: 'English quotes', regex: /["']([^"']+)["']/g },
  { name: 'Czech quotes', regex: /„([^„"]+)"/g },
  { name: 'Old pattern', regex: /[„"]([^„"]+)[""]/g }
];

console.log('Text to test:');
console.log(text);
console.log('\nPattern tests:');

patterns.forEach(p => {
  const matches = text.match(p.regex);
  console.log(`${p.name}: ${matches ? matches.length + ' matches - ' + matches.join(' | ') : 'NO MATCHES'}`);
});
