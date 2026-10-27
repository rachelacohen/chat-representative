// Ask the chat service one question from the command line:
//   npm run ask -- "הלקוח 4471 רוצה לבטל, מה מגיע לו?"
//   npm run ask -- "..." --json      full result, including the facts file and the guard
// On Windows use Windows Terminal (or run chcp 65001 first) so Hebrew prints correctly.
import { createAppChatService } from './chat/setup.js';

const SOURCE_LABELS = {
  llm: 'מקור: המודל, אחרי שעבר את השומר',
  template: 'מקור: תשובת תבנית בטוחה',
  escalation: 'מקור: הפניה למנהל',
  clarify: 'מקור: בקשת הבהרה',
  outOfScope: 'מקור: שאלה שלא בנושא פוליסות',
};

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const question = args.filter((a) => a !== '--json').join(' ').trim();
if (!question) {
  console.error('usage: npm run ask -- "<question>" [--json]');
  process.exit(1);
}

const result = await createAppChatService().answer(question);
if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(result.answer);
  console.log('');
  console.log(SOURCE_LABELS[result.source]);
  if (result.guard && !result.guard.passed) {
    console.log('השומר חסם את טיוטת המודל, בגלל הבדיקות האלה');
    console.log(result.guard.violations.map((v) => v.code).join(', '));
  }
  if (result.modelError) console.log('המודל לא ענה, ולכן נשלחה תשובת תבנית');
  console.log(`זמן תגובה ${result.latencyMs} אלפיות שנייה`);
}
