const text = `„Ani ty nevypadáš bůhvíjak, Joe," poznamenala Lili Saffro. „Balzamovač, co si tě vzal na paškál, ti růž a oční linky nanášel s až příliš velkým nadšením."`;

const dialogueRegex = /[\u201E\u201C„"]([^\u201E\u201C""]+)[\u201E\u201C""]\s*([,.]?\s*(zvolal|zvolala|poznamenal|poznamenala|řekl|řekla|odpověděl|odpověděla|prohlásil|prohlásila|dodal|dodala|podotkl|podotkla)\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)*))?/g;

let match;
console.log('Testing regex:');
while ((match = dialogueRegex.exec(text)) !== null) {
  console.log('\nMatch:');
  console.log(`  Full: "${match[0].substring(0, 80)}..."`);
  console.log(`  Dialogue: "${match[1]}"`);
  console.log(`  Attribution group: ${match[2] || '(none)'}`);
  console.log(`  Verb: ${match[3] || '(none)'}`);
  console.log(`  Speaker: ${match[4] || '(none)'}`);
}
