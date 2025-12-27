const text = `Po dlouhém tichu smrti Joseph Ragowski pozvedl hlas, a nebylo to příjemné, jak po stránce zvukové, tak naladěním. 
„Jen se na sebe podívejte," zvolal, zatímco si zkoumavě prohlížel pětici mágů, jež ho probudila z bezesného spánku. „Všichni vypadáte jako mátohy!" 
„Ani ty nevypadáš bůhvíjak, Joe," poznamenala Lili Saffro. „Balzamovač, co si tě vzal na paškál, ti růž a oční linky nanášel s až příliš velkým nadšením."`;

const dialogueRegex = /[„"]([^""]+)[""]\s*([,.]?\s*(zvolal|zvolala|poznamenal|poznamenala|řekl|řekla)\s+)?([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)*)?/g;

let match;
let count = 0;
while ((match = dialogueRegex.exec(text)) !== null) {
  count++;
  console.log(`\nMatch ${count}:`);
  console.log(`  Full match: "${match[0].substring(0, 80)}..."`);
  console.log(`  Dialogue: "${match[1]}"`);
  console.log(`  Verb: ${match[3] || '(none)'}`);
  console.log(`  Speaker: ${match[4] || '(none)'}`);
}

console.log(`\nTotal matches: ${count}`);
